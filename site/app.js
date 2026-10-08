(() => {
	'use strict';

	// Caddy's `file_server browse` answers this with a JSON listing of the music folder.
	const MUSIC_URL = 'music/';
	const AUDIO_FILE = /\.(mp3|ogg|opus|m4a|flac|wav)$/i;
	const BARS = 100;

	const $ = (id) => document.getElementById(id);
	const canvas = $('visualizer');
	const seek = $('seek');
	const seekFill = $('seek-fill');
	const playBtn = $('play');
	const shuffleBtn = $('shuffle');
	const muteBtn = $('mute');
	const volumeInput = $('volume');
	const timeNow = $('time-now');
	const timeTotal = $('time-total');
	const nowPlaying = $('now-playing');
	const list = $('tracks');
	const about = $('about');

	const store = {
		get(key, fallback) {
			try {
				const value = localStorage.getItem('kgj.' + key);
				return value === null ? fallback : JSON.parse(value);
			} catch {
				return fallback;
			}
		},
		set(key, value) {
			try { localStorage.setItem('kgj.' + key, JSON.stringify(value)); } catch {}
		},
	};

	const audio = new Audio();
	audio.preload = 'metadata';

	let tracks = [];
	let current = -1;
	const history = [];
	let failures = 0;
	let shuffle = store.get('shuffle', true);
	let muted = false;
	let volume = store.get('volume', 0.5);

	// ---- Track list ----

	const trackUrl = (i) => MUSIC_URL + encodeURIComponent(tracks[i]);

	async function loadTracks() {
		const res = await fetch(MUSIC_URL, { headers: { Accept: 'application/json' } });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const entries = await res.json();
		return entries
			.filter((e) => !e.is_dir && AUDIO_FILE.test(e.name))
			.map((e) => e.name)
			.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	}

	function renderTracks() {
		const frag = document.createDocumentFragment();
		tracks.forEach((name, i) => {
			const li = document.createElement('li');
			const a = document.createElement('a');
			a.href = trackUrl(i);
			a.textContent = name;
			a.dataset.index = i;
			li.append(a);
			frag.append(li);
		});
		list.replaceChildren(frag);
	}

	// "GROUP_-_Some_Release.mp3" -> { artist: "GROUP", title: "Some Release" }
	function describe(name) {
		const clean = (s) => s.replace(/_/g, ' ').trim();
		const base = name.replace(/\.[^.]+$/, '');
		const [group, ...rest] = base.split('_-_');
		return rest.length
			? { artist: clean(group), title: clean(rest.join(' - ')) }
			: { artist: '', title: clean(base) };
	}

	// ---- Playback ----

	function play(i, remember = true) {
		if (remember && current >= 0 && current !== i) {
			history.push(current);
			if (history.length > 500) history.shift();
		}
		const previous = list.children[current];
		if (previous) {
			previous.classList.remove('playing');
			previous.firstChild.removeAttribute('aria-current');
		}
		current = i;
		list.children[i].classList.add('playing');
		list.children[i].firstChild.setAttribute('aria-current', 'true');

		nowPlaying.textContent = tracks[i];
		nowPlaying.disabled = false;
		document.title = `${tracks[i]} | keygenjukebox.net`;
		if ('mediaSession' in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				...describe(tracks[i]),
				album: 'keygenjukebox.net',
				artwork: [{ src: 'img/cover.png', sizes: '512x512', type: 'image/png' }],
			});
		}

		audio.src = trackUrl(i);
		resume();
	}

	function resume() {
		startAudioGraph();
		audio.play().catch(() => {});
	}

	function toggle() {
		if (current < 0) next();
		else if (audio.paused) resume();
		else audio.pause();
	}

	function next() {
		if (!tracks.length) return;
		let i = (current + 1) % tracks.length;
		if (shuffle && tracks.length > 1) {
			do i = Math.floor(Math.random() * tracks.length); while (i === current);
		}
		play(i);
	}

	function prev() {
		if (!tracks.length) return;
		if (current < 0) return next();
		const i = history.length ? history.pop() : (current - 1 + tracks.length) % tracks.length;
		play(i, false);
	}

	function applyVolume() {
		// Once the Web Audio graph exists, volume lives on the gain node so the
		// visualizer keeps its full height when the volume is low or muted.
		if (gain) {
			gain.gain.value = muted ? 0 : volume;
		} else {
			audio.volume = volume;
			audio.muted = muted;
		}
	}

	function formatTime(seconds) {
		if (!Number.isFinite(seconds)) return '0:00';
		const s = Math.floor(seconds);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	}

	function syncTime() {
		const { currentTime, duration } = audio;
		const known = Number.isFinite(duration) && duration > 0;
		const percent = known ? (currentTime / duration) * 100 : 0;
		timeNow.textContent = formatTime(currentTime);
		timeTotal.textContent = formatTime(known ? duration : 0);
		seekFill.style.width = `${percent}%`;
		seek.setAttribute('aria-valuenow', Math.round(percent));
		seek.setAttribute('aria-valuetext', `${timeNow.textContent} of ${timeTotal.textContent}`);
	}

	function syncPlayState() {
		const playing = !audio.paused;
		playBtn.classList.toggle('playing', playing);
		playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
		if (playing) startDrawing();
	}

	function seekTo(fraction) {
		if (!Number.isFinite(audio.duration)) return;
		audio.currentTime = Math.min(1, Math.max(0, fraction)) * audio.duration;
		syncTime();
	}

	function seekToPointer(e) {
		const rect = seek.getBoundingClientRect();
		seekTo((e.clientX - rect.left) / rect.width);
	}

	// ---- Visualizer ----

	const ctx2d = canvas.getContext('2d');
	let audioCtx, analyser, gain, bins;
	let accent = '#3498db';
	let frame = 0;

	// Browsers only allow an AudioContext to start from a user gesture, so the
	// graph is built on the first play rather than at page load.
	function startAudioGraph() {
		if (!audioCtx) {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) return;
			audioCtx = new AudioContext();
			analyser = audioCtx.createAnalyser();
			gain = audioCtx.createGain();
			audioCtx.createMediaElementSource(audio).connect(analyser);
			analyser.connect(gain).connect(audioCtx.destination);
			bins = new Uint8Array(analyser.frequencyBinCount);
			audio.volume = 1;
			audio.muted = false;
			applyVolume();
		}
		if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
	}

	function readTheme() {
		accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent;
	}

	function fitCanvas() {
		const ratio = window.devicePixelRatio || 1;
		const width = Math.round(canvas.clientWidth * ratio);
		const height = Math.round(canvas.clientHeight * ratio);
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
	}

	function draw() {
		frame = 0;
		const { width, height } = canvas;
		ctx2d.clearRect(0, 0, width, height);
		if (!analyser) return;

		analyser.getByteFrequencyData(bins);
		ctx2d.fillStyle = accent;
		const step = width / BARS;
		const gap = Math.max(1, Math.round(step / 3));
		let live = false;
		for (let i = 0; i < BARS; i++) {
			if (!bins[i]) continue;
			live = true;
			const x = Math.round(i * step);
			const barWidth = Math.max(1, Math.round((i + 1) * step) - x - gap);
			const barHeight = Math.round((bins[i] / 255) * 0.85 * height);
			ctx2d.fillRect(x, height - barHeight, barWidth, barHeight);
		}
		// Keep animating after a pause until the bars have fallen back to zero.
		if (!audio.paused || live) startDrawing();
	}

	function startDrawing() {
		if (!frame) frame = requestAnimationFrame(draw);
	}

	// ---- Wiring ----

	audio.addEventListener('play', syncPlayState);
	audio.addEventListener('pause', syncPlayState);
	audio.addEventListener('ended', next);
	audio.addEventListener('timeupdate', syncTime);
	audio.addEventListener('durationchange', syncTime);
	audio.addEventListener('emptied', syncTime);
	audio.addEventListener('playing', () => { failures = 0; });
	// Skip files that fail to load, but give up after a few in a row.
	audio.addEventListener('error', () => { if (++failures < 5) next(); });

	playBtn.addEventListener('click', toggle);
	$('prev').addEventListener('click', prev);
	$('next').addEventListener('click', next);

	shuffleBtn.addEventListener('click', () => {
		shuffle = !shuffle;
		shuffleBtn.setAttribute('aria-pressed', shuffle);
		store.set('shuffle', shuffle);
	});

	muteBtn.addEventListener('click', () => {
		muted = !muted;
		muteBtn.setAttribute('aria-pressed', muted);
		applyVolume();
	});

	volumeInput.addEventListener('input', () => {
		volume = Number(volumeInput.value);
		store.set('volume', volume);
		applyVolume();
	});

	seek.addEventListener('pointerdown', (e) => {
		seek.setPointerCapture(e.pointerId);
		seekToPointer(e);
	});
	seek.addEventListener('pointermove', (e) => {
		if (seek.hasPointerCapture(e.pointerId)) seekToPointer(e);
	});
	seek.addEventListener('keydown', (e) => {
		const delta = { ArrowLeft: -5, ArrowRight: 5 }[e.key];
		if (!delta || !Number.isFinite(audio.duration)) return;
		e.preventDefault();
		seekTo((audio.currentTime + delta) / audio.duration);
	});

	list.addEventListener('click', (e) => {
		const link = e.target.closest('a[data-index]');
		// Leave modified clicks alone so the links still open/download normally.
		if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		play(Number(link.dataset.index));
	});

	nowPlaying.addEventListener('click', () => {
		list.children[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	});

	document.addEventListener('keydown', (e) => {
		if (e.code !== 'Space' || e.target.closest('a, button, input, [role="slider"]')) return;
		e.preventDefault();
		toggle();
	});

	$('dismiss').addEventListener('click', () => {
		about.classList.add('dismissed');
		setTimeout(() => about.remove(), 200);
	});

	if ('mediaSession' in navigator) {
		navigator.mediaSession.setActionHandler('play', resume);
		navigator.mediaSession.setActionHandler('pause', () => audio.pause());
		navigator.mediaSession.setActionHandler('previoustrack', prev);
		navigator.mediaSession.setActionHandler('nexttrack', next);
	}

	matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		readTheme();
		startDrawing();
	});
	new ResizeObserver(() => {
		fitCanvas();
		startDrawing();
	}).observe(canvas);

	shuffleBtn.setAttribute('aria-pressed', shuffle);
	volumeInput.value = volume;
	applyVolume();
	readTheme();
	fitCanvas();

	loadTracks().then(
		(names) => {
			tracks = names;
			renderTracks();
		},
		() => {
			list.firstElementChild.textContent = 'Could not load the track list.';
		},
	);
})();
