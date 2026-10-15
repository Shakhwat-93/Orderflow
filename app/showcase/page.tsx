'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, RotateCcw,
  Sparkles, CheckCircle2, Shield, Layers, BarChart3, Truck, Factory,
  Package, ChevronRight, Download
} from 'lucide-react';

interface SceneChapter {
  id: number;
  time: number;
  title: string;
  tag: string;
  icon: React.ReactNode;
  description: string;
}

const CHAPTERS: SceneChapter[] = [
  {
    id: 1,
    time: 0,
    title: 'Brand Reveal',
    tag: '0:00 - 0:10',
    icon: <Sparkles className="w-4 h-4 text-sky-400" />,
    description: 'Autonomous platform assembly and enterprise vision.'
  },
  {
    id: 2,
    time: 10,
    title: 'Smart Order Management',
    tag: '0:10 - 0:28',
    icon: <Package className="w-4 h-4 text-blue-400" />,
    description: 'Unified order lifecycle, drawer audit logs, and status progression.'
  },
  {
    id: 3,
    time: 28,
    title: 'Connected Operations',
    tag: '0:28 - 0:48',
    icon: <Truck className="w-4 h-4 text-emerald-400" />,
    description: 'Call team triage, automated Steadfast booking, and factory queues.'
  },
  {
    id: 4,
    time: 48,
    title: 'Inventory & Material Accounts',
    tag: '0:48 - 1:05',
    icon: <Layers className="w-4 h-4 text-cyan-400" />,
    description: 'Warehouse SKU balances, supplier payables, and purchase ledgers.'
  },
  {
    id: 5,
    time: 65,
    title: 'Intelligent Analytics & Security',
    tag: '1:05 - 1:23',
    icon: <BarChart3 className="w-4 h-4 text-purple-400" />,
    description: 'Real-time sales velocity, revenue curves, and AI fraud defense.'
  },
  {
    id: 6,
    time: 83,
    title: 'Unified Ecosystem Finale',
    tag: '1:23 - 1:40',
    icon: <Shield className="w-4 h-4 text-indigo-400" />,
    description: 'The master architecture: run your entire business from one platform.'
  }
];

export default function ShowcasePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(100);
  const [activeChapter, setActiveChapter] = useState(CHAPTERS[0]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const ch = [...CHAPTERS].reverse().find(c => video.currentTime >= c.time) || CHAPTERS[0];
      setActiveChapter(ch);
    };

    const handleLoadedMetadata = () => {
      if (video.duration) setDuration(video.duration);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const seekTo = (sec: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = sec;
    videoRef.current.play();
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoRef.current.requestFullscreen();
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-[#060913] text-slate-100 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Navigation */}
      <header className="border-b border-slate-800/80 bg-[#060913]/90 backdrop-blur-md sticky top-0 z-50 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20 border border-white/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-white text-lg">BUSINESSPILOT</span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                Product Showcase
              </span>
            </div>
            <p className="text-xs text-slate-400">Run Your Entire Business From One Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/orders?preview=true"
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            Open Live Application &rarr;
          </a>
          <a
            href="/businesspilot_showcase_1080p.mp4"
            download="businesspilot_showcase_1080p.mp4"
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition shadow-lg shadow-sky-500/25"
          >
            <Download className="w-3.5 h-3.5" />
            Download Master 1080p MP4
          </a>
        </div>
      </header>

      {/* Main Showcase Hero */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        {/* Title Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
              Cinematic Product Film &bull; 100 Seconds &bull; 1080p 60fps
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
              BUSINESSPILOT SHOWCASE
            </h1>
            <p className="text-slate-400 text-base md:text-lg mt-1">
              Watch how orders, fulfillment, logistics, inventory, and accounts unite in a single high-performance system.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 px-4 py-2.5 rounded-xl">
            <span className="text-xs text-slate-400">Active Chapter:</span>
            <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
              {activeChapter.icon}
              {activeChapter.title}
            </span>
          </div>
        </div>

        {/* Video Player Card */}
        <div className="relative group rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl shadow-black/80 aspect-video">
          <video
            ref={videoRef}
            src="/businesspilot_showcase_1080p.mp4"
            poster="/showcase_assets/plates/scene_1_brand.png"
            className="w-full h-full object-cover cursor-pointer"
            onClick={togglePlay}
            playsInline
          />

          {/* Big Play Overlay (when paused) */}
          {!isPlaying && (
            <div
              onClick={togglePlay}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center cursor-pointer transition-all duration-300"
            >
              <div className="w-20 h-20 rounded-full bg-sky-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-sky-500/50 hover:scale-110 active:scale-95 transition">
                <Play className="w-8 h-8 fill-current ml-1" />
              </div>
            </div>
          )}

          {/* Bottom Player Controls */}
          <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 opacity-95 transition">
            {/* Progress Bar */}
            <div
              className="w-full h-1.5 bg-slate-700/60 rounded-full overflow-hidden cursor-pointer hover:h-2.5 transition-all"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                seekTo(pos * duration);
              }}
            >
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 relative"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
                </button>

                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                <span className="font-mono text-slate-400">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => seekTo(0)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Replay from start"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Storyboard Chapters */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Storyboard Architecture &bull; 6 Operational Scenes</span>
            </h2>
            <span className="text-xs text-slate-400">Click any chapter to jump directly</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHAPTERS.map((ch) => {
              const isCurrent = activeChapter.id === ch.id;
              return (
                <div
                  key={ch.id}
                  onClick={() => seekTo(ch.time)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isCurrent
                      ? 'bg-slate-900 border-sky-500/50 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700">
                        {ch.icon}
                      </div>
                      <span className="font-bold text-sm text-white">{ch.title}</span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {ch.tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{ch.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Feature Matrix Cards */}
        <div className="mt-4 p-6 rounded-2xl bg-gradient-to-r from-sky-950/30 via-slate-900/60 to-indigo-950/30 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-bold text-white">Production-Ready Enterprise Operations</h3>
            <p className="text-xs text-slate-400 max-w-2xl">
              Engineered with zero third-party video templates. All screens captured directly from the live BusinessPilot production codebase, paired with custom 48kHz audio synthesis and 1080p 30fps H.264 master encoding.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/orders?preview=true"
              className="text-xs font-bold px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 transition shadow-lg shadow-sky-500/20"
            >
              Launch Platform Console
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
