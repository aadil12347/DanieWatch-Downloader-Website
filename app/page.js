'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const TYPE_MAP = { 1: 'movie', 2: 'tv', 3: 'anime', 7: 'short-tv' };
const BADGE_CLASS = { movie: 'badge-movie', tv: 'badge-tv', anime: 'badge-anime', 'short-tv': 'badge-tv' };
const FILTERS = [
  { label: 'All', value: 0 },
  { label: 'Movies', value: 1 },
  { label: 'Series', value: 2 },
  // { label: 'Anime', value: 3 },
];

function cleanTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // remove brackets like [Hindi]
    .replace(/\([^)]*\)/g, '') // remove parens like (2022)
    .replace(/\bs\d+(-s\d+)?\b/gi, '') // remove S1-S5, S1
    .replace(/\bseason\s*\d+\b/gi, '') // remove Season 1
    .replace(/\b(dubbed|subbed|multi|dual\s*audio|hindi|english|telugu|tamil|eng|dub|sub)\b/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

export default function HomePage() {
  // PWA Install state
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [platform, setPlatform] = useState('desktop'); // 'ios', 'android', 'desktop'
  const deferredPromptRef = useRef(null);

  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [results, setResults] = useState([]);
  const [pager, setPager] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState(0);
  const [searched, setSearched] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [whitelist, setWhitelist] = useState([]);

  // Fetch Whitelist on Mount
  useEffect(() => {
    fetchWhitelist();
  }, []);

  const fetchWhitelist = async () => {
    try {
      const res = await fetch('/api/index/add');
      const data = await res.json();
      if (Array.isArray(data)) {
        setWhitelist(data);
      }
    } catch (err) {
      console.error('Failed to fetch whitelist:', err);
    }
  };

  const isItemWhitelisted = (item) => {
    if (!item) return false;
    return whitelist.some(w => String(w[3]) === String(item.subjectId));
  };

  // Detail modal state
  const [selectedItem, setSelectedItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [downloads, setDownloads] = useState(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  // VCloud state
  const [vcloudResolutions, setVcloudResolutions] = useState(null);
  const [vcloudLoading, setVcloudLoading] = useState(false);
  const [vcloudExtractingRes, setVcloudExtractingRes] = useState(null);
  const [vcloudServers, setVcloudServers] = useState(null);
  const [vcloudError, setVcloudError] = useState(null);
  const [vcloudLayout, setVcloudLayout] = useState(null);
  const [vcloudLayoutLoading, setVcloudLayoutLoading] = useState(false);
  const [vcloudSelectedSeason, setVcloudSelectedSeason] = useState(1);
  const [vcloudSelectedEpisode, setVcloudSelectedEpisode] = useState(1);
  const [vcloudButtonErrors, setVcloudButtonErrors] = useState({});
  const [downloadingUrl, setDownloadingUrl] = useState(null);

  // Toast Notifications state
  const [notifications, setNotifications] = useState([]);

  const suggestTimer = useRef(null);
  const searchInputRef = useRef(null);

  // Toast Alerts Trigger
  const showToast = (message, type = 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  // PWA & Service Worker Logic
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
        .catch((err) => console.error('Service Worker registration failed:', err));
    }

    // Detect platform
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    if (isIOS) {
      setPlatform('ios');
    } else if (isAndroid) {
      setPlatform('android');
    } else {
      setPlatform('desktop');
    }

    // Check if running in standalone mode (i.e. already installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      setShowInstallBtn(false);
      return;
    }

    // Show install button by default if not standalone on all devices
    setShowInstallBtn(true);

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShowInstallBtn(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setShowInstallBtn(false);
      deferredPromptRef.current = null;
      showToast('DanieWatch App installed successfully!', 'success');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    if (deferredPromptRef.current) {
      deferredPromptRef.current.prompt();
      deferredPromptRef.current.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          setShowInstallBtn(false);
        }
        deferredPromptRef.current = null;
      });
    } else {
      // Toggle platform-specific instructions
      setShowInstructions(prev => !prev);
    }
  };

  // Add Item to Whitelist index
  const addToIndex = async (item) => {
    showToast(`Adding "${item.title}" to curation index...`, 'info');
    try {
      const res = await fetch('/api/index/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          type: item.subjectType === 2 || item.subjectType === 3 ? 'tv' : 'movie',
          subjectId: item.subjectId,
          detailPath: item.detailPath
        })
      });
      const data = await res.json();
      if (data.code === 0) {
        showToast(data.message || `"${item.title}" added successfully!`, 'success');
        fetchWhitelist(); // Update whitelist state
      } else {
        throw new Error(data.message || 'Failed to add to index');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Remove Item from Whitelist index
  const removeFromIndex = async (item) => {
    showToast(`Removing "${item.title}" from curation index...`, 'info');
    try {
      const res = await fetch('/api/index/add', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: item.subjectId
        })
      });
      const data = await res.json();
      if (data.code === 0) {
        showToast(data.message || `"${item.title}" removed successfully!`, 'success');
        fetchWhitelist(); // Update whitelist state
      } else {
        throw new Error(data.message || 'Failed to remove from index');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Re-trigger search when curation toggle is switched
  useEffect(() => {
    if (searched && query.trim()) {
      doSearch(query, 1, filter);
    }
  }, [isAdmin]);

  // ---- AUTOCOMPLETE ----
  const fetchSuggestions = useCallback(async (keyword) => {
    if (!keyword || keyword.length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch('/api/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword, perPage: 8 }),
      });
      const data = await res.json();
      const items = data?.data?.items || [];
      setSuggestions(items.map(i => i.word));
    } catch { setSuggestions([]); }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(() => fetchSuggestions(val), 300);
    setShowSuggestions(true);
  };

  // ---- SEARCH ----
  const doSearch = useCallback(async (keyword, page = 1, subjectType = filter, append = false) => {
    if (!keyword.trim()) return;
    if (!append) setLoading(true);
    else setLoadingMore(true);
    setError('');
    setShowSuggestions(false);
    setSearched(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), page, perPage: 15, subjectType, showIndexOnly: false /* !isAdmin */ }),
      });
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.message || 'Search failed');
      const items = data.data?.items || [];
      setResults(prev => append ? [...prev, ...items] : items);
      setPager(data.data?.pager || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, isAdmin]);

  const handleSearch = (e) => {
    e?.preventDefault();
    doSearch(query, 1, filter);
  };

  const handleSuggestionClick = (word) => {
    setQuery(word);
    setShowSuggestions(false);
    doSearch(word, 1, filter);
  };

  const handleFilterChange = (val) => {
    setFilter(val);
    if (query.trim()) doSearch(query, 1, val);
  };

  const handleLoadMore = useCallback(() => {
    if (pager?.hasMore && !loadingMore && !loading) {
      const nextPage = parseInt(pager.nextPage || pager.page) + (pager.nextPage ? 0 : 1);
      doSearch(query, nextPage, filter, true);
    }
  }, [pager, loadingMore, loading, query, filter, doSearch]);

  // ---- DOWNLOAD TRIGGER ----
  const triggerDownload = (url, title, e) => {
    e?.preventDefault();
    setDownloadingUrl(url);
    showToast(`Download "${title}" Started!`, 'success');
    setTimeout(() => {
      setDownloadingUrl(null);
    }, 2000);
    window.location.href = url;
  };

  // Clear hash on mount to avoid stale modal states
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#detail') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Listen for browser back button (popstate) to close detail modal
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window !== 'undefined' && window.location.hash !== '#detail' && selectedItem) {
        setSelectedItem(null);
        setDetail(null);
        setDownloads(null);
        setModalError('');
        // Reset VCloud states
        setVcloudLayout(null);
        setVcloudResolutions(null);
        setVcloudServers(null);
        setVcloudError(null);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedItem]);

  // ---- DETAIL ----
  const openDetail = async (item) => {
    setSelectedItem(item);
    setDetail(null);
    setDownloads(null);
    setDetailLoading(true);
    setModalError('');

    if (typeof window !== 'undefined') {
      window.history.pushState({ modalOpen: true }, '', '#detail');
    }

    const isTv = item.subjectType === 2 || item.subjectType === 3;
    const initialSeason = isTv ? 1 : 0;
    const initialEpisode = isTv ? 1 : 0;
    setSelectedSeason(initialSeason);
    setSelectedEpisode(initialEpisode);

    const whitelistedEntry = whitelist.find(w => {
      const parts = String(item.subjectId).split('_');
      const tmdbId = parts.length > 2 ? parts[2] : String(item.subjectId);
      return String(w[0]) === tmdbId || String(w[3]) === String(item.subjectId);
    });
    const isGithubItem = item.fromGithubCatalog || String(item.subjectId).startsWith('github_');

    if (!isGithubItem) {
      // Auto-fetch AoneRoom downloads immediately for AoneRoom items only
      fetchDownloads(item.subjectId, initialSeason, initialEpisode, item.detailPath);
    }

    try {
      const res = await fetch(`/api/detail?detailPath=${encodeURIComponent(item.detailPath)}`);
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.message || 'Detail fetch failed');
      setDetail(data.data);
    } catch (err) {
      console.error(err);
      setModalError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    if (typeof window !== 'undefined' && window.location.hash === '#detail') {
      window.history.back();
    } else {
      setSelectedItem(null);
      setDetail(null);
      setDownloads(null);
      setModalError('');
      // Reset VCloud states
      setVcloudLayout(null);
      setVcloudResolutions(null);
      setVcloudServers(null);
      setVcloudError(null);
    }
  };

  // ---- DOWNLOADS ----
  const fetchDownloads = async (subjectId, se, ep, detailPath) => {
    setDownloadLoading(true);
    setDownloads(null);
    try {
      const res = await fetch(`/api/download?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${encodeURIComponent(detailPath)}`);
      const data = await res.json();
      if (data.code !== 0) throw new Error(data.message || 'Download fetch failed');
      setDownloads(data.data);
    } catch (err) {
      setDownloads({ downloads: [], captions: [], hasResource: false, error: err.message });
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleEpisodeClick = (se, ep) => {
    setSelectedSeason(se);
    setSelectedEpisode(ep);
    if (selectedItem) {
      fetchDownloads(selectedItem.subjectId, se, ep, selectedItem.detailPath);
    }
  };

  // Automatically fetch VCloud layout when modal opens (only for series)
  useEffect(() => {
    if (!selectedItem) {
      setVcloudLayout(null);
      return;
    }

    const whitelistedEntry = whitelist.find(w => {
      const parts = String(selectedItem.subjectId).split('_');
      const tmdbId = parts.length > 2 ? parts[2] : String(selectedItem.subjectId);
      return String(w[0]) === tmdbId || String(w[3]) === String(selectedItem.subjectId);
    });
    const isGithubItem = selectedItem.fromGithubCatalog || String(selectedItem.subjectId).startsWith('github_');
    
    if (!isGithubItem) return;

    const mediaType = selectedItem.subjectType === 2 || selectedItem.subjectType === 3 ? 'series' : 'movie';
    if (mediaType !== 'series') {
      setVcloudLayout(null);
      return;
    }

    // Extract tmdbId correctly
    let tmdbId = '';
    if (selectedItem.subjectId.startsWith('github_')) {
      const parts = selectedItem.subjectId.split('_');
      tmdbId = parts[2];
    }

    const title = whitelistedEntry ? whitelistedEntry[1] : selectedItem.title;
    const imdbId = whitelistedEntry ? whitelistedEntry[2] : null;
    const releaseYear = selectedItem.releaseDate ? parseInt(selectedItem.releaseDate.slice(0, 4)) : null;

    async function loadVcloudLayout() {
      setVcloudLayoutLoading(true);
      setVcloudLayout(null);
      setVcloudError(null);
      try {
        const res = await fetch(
          `/api/resolve-streams?tmdbId=${tmdbId}&mediaType=series&title=${encodeURIComponent(title)}&year=${releaseYear || ''}&imdb=${imdbId || ''}&layout=true`
        );
        const data = await res.json();
        if (data.success && data.layout) {
          setVcloudLayout(data.layout);
          // Auto select first season and episode
          const seasons = Object.keys(data.layout).map(Number).sort((a, b) => a - b);
          if (seasons.length > 0) {
            const firstSe = seasons[0];
            const episodes = data.layout[firstSe] || [];
            const firstEp = episodes.length > 0 ? episodes[0] : 1;
            setVcloudSelectedSeason(firstSe);
            setVcloudSelectedEpisode(firstEp);
          }
        } else {
          setVcloudError(data.error || 'No layout/episode data found for this TV show.');
        }
      } catch (err) {
        setVcloudError('Failed to load episodes layout from GitHub.');
      } finally {
        setVcloudLayoutLoading(false);
      }
    }

    loadVcloudLayout();
  }, [selectedItem, whitelist]);

  // Automatically fetch VCloud resolutions when modal opens or season/episode changes
  useEffect(() => {
    if (!selectedItem) {
      setVcloudResolutions(null);
      setVcloudServers(null);
      setVcloudError(null);
      return;
    }

    const whitelistedEntry = whitelist.find(w => {
      const parts = String(selectedItem.subjectId).split('_');
      const tmdbId = parts.length > 2 ? parts[2] : String(selectedItem.subjectId);
      return String(w[0]) === tmdbId || String(w[3]) === String(selectedItem.subjectId);
    });
    const isGithubItem = selectedItem.fromGithubCatalog || String(selectedItem.subjectId).startsWith('github_');
    
    if (!isGithubItem) {
      setVcloudResolutions(null);
      return;
    }

    // Extract tmdbId correctly
    let tmdbId = '';
    if (selectedItem.subjectId.startsWith('github_')) {
      const parts = selectedItem.subjectId.split('_');
      tmdbId = parts[2];
    }

    const title = whitelistedEntry ? whitelistedEntry[1] : selectedItem.title;
    const imdbId = whitelistedEntry ? whitelistedEntry[2] : null;
    const mediaType = selectedItem.subjectType === 2 || selectedItem.subjectType === 3 ? 'series' : 'movie';
    const releaseYear = selectedItem.releaseDate ? parseInt(selectedItem.releaseDate.slice(0, 4)) : null;

    if (mediaType === 'series' && (!vcloudSelectedSeason || !vcloudSelectedEpisode)) {
      return;
    }

    async function loadVcloudResolutions() {
      setVcloudLoading(true);
      setVcloudResolutions(null);
      setVcloudServers(null);
      setVcloudError(null);

      try {
        const episodeQuery = mediaType === 'series' ? `&season=${vcloudSelectedSeason}&episode=${vcloudSelectedEpisode}` : '';
        const res = await fetch(
          `/api/resolve-streams?tmdbId=${tmdbId}&mediaType=${mediaType}&title=${encodeURIComponent(title)}&year=${releaseYear || ''}&imdb=${imdbId || ''}${episodeQuery}`
        );
        const data = await res.json();
        if (data.success && data.resolutions && Object.keys(data.resolutions).length > 0) {
          setVcloudResolutions(data.resolutions);
        } else {
          setVcloudError('No VCloud streaming resolutions found for this selection.');
        }
      } catch (err) {
        setVcloudError('Failed to load VCloud streaming index.');
      } finally {
        setVcloudLoading(false);
      }
    }

    loadVcloudResolutions();
  }, [selectedItem, vcloudSelectedSeason, vcloudSelectedEpisode, whitelist]);

  const handleVcloudExtract = async (vcloudUrl, resolutionName) => {
    setVcloudExtractingRes(resolutionName);
    setVcloudError(null);
    setVcloudServers(null);
    setVcloudButtonErrors(prev => ({ ...prev, [resolutionName]: null }));

    try {
      // Fetch and parse VCloud links in a single request
      const response = await fetch('/api/extract-vcloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: vcloudUrl })
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.servers) {
        throw new Error(data.error || 'Failed to extract video links.');
      }
      
      setVcloudServers(data.servers);

      // Select server in priority order: Server 1 -> Server 2 -> Server 3
      const priorityOrder = ['Server 1', 'Server 2', 'Server 3'];
      let selectedServerName = null;
      let selectedServerUrl = null;

      for (const name of priorityOrder) {
        if (data.servers[name]) {
          selectedServerName = name;
          selectedServerUrl = data.servers[name];
          break;
        }
      }

      if (!selectedServerUrl) {
        // Fallback to whatever server exists if priority ones aren't available
        const available = Object.keys(data.servers);
        if (available.length > 0) {
          selectedServerName = available[0];
          selectedServerUrl = data.servers[selectedServerName];
        }
      }

      if (selectedServerUrl) {
        const dlUrl = `/api/stream?url=${encodeURIComponent(selectedServerUrl)}&title=${encodeURIComponent(selectedItem.title)}&res=${selectedServerName}&se=${vcloudSelectedSeason || 0}&ep=${vcloudSelectedEpisode || 0}`;
        triggerDownload(dlUrl, selectedItem.title);
      } else {
        throw new Error('No download server links returned.');
      }
    } catch (err) {
      setVcloudError(err.message || 'An error occurred during link extraction.');
      setVcloudButtonErrors(prev => ({ ...prev, [resolutionName]: 'Extraction Failed' }));
      showToast('Link extraction failed. Please try again.', 'error');
      setTimeout(() => {
        setVcloudButtonErrors(prev => ({ ...prev, [resolutionName]: null }));
      }, 3000);
    } finally {
      setVcloudExtractingRes(null);
    }
  };

  const handleLogoClick = (e) => {
    e?.preventDefault();
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setResults([]);
    setPager(null);
    setError('');
    setFilter(0);
    setSearched(false);
    setSelectedItem(null);
    setDetail(null);
    setDownloads(null);
  };

  // Close modal on Escape
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') closeDetail(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 0. GSAP SPLASH SCREEN & ENTRANCE ANIMATIONS INITIALIZATION (Client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initSplashAnimations = () => {
      if (!window.gsap || !window.Splitting) {
        setTimeout(initSplashAnimations, 100);
        return;
      }

      const gsap = window.gsap;
      const Splitting = window.Splitting;

      // Initialize Splitting.js for all elements with data-splitting
      Splitting();

      // 1. Splash SVG Text stroke animation
      gsap.fromTo(".splash_text", {
        scale: 4,
        autoAlpha: 0,
      }, {
        duration: 3.5,
        ease: "expo.out",
        scale: 1,
        autoAlpha: 1,
      });

      // Animate the stroke paths of the SVG text
      gsap.fromTo(".stroke-danie, .stroke-watch", {
        strokeDashoffset: 1200,
        strokeDasharray: 1200,
      }, {
        duration: 3,
        ease: "power2.inOut",
        strokeDashoffset: 0,
      });

      // Fade out splash overlay
      gsap.fromTo('.splash_sec', {
        autoAlpha: 1,
      }, {
        delay: 3.2,
        duration: 0.8,
        ease: "power2.out",
        autoAlpha: 0,
        onComplete: () => {
          const splashEl = document.querySelector('.splash_sec');
          if (splashEl) splashEl.style.display = 'none';
        }
      });

      // 2. Home Page Elements Timeline (starts just before/during splash fade out)
      const tl = gsap.timeline({ delay: 3.0 });

      // Animate Header Link / Title
      tl.from(".logo-link span", {
        duration: 1.2,
        ease: "elastic.out(1, 0.75)",
        x: -30,
        autoAlpha: 0,
      })
      // Animate Header Navigation Steps
      .from(".header-step-pill", {
        duration: 0.8,
        ease: "power2.out",
        y: -15,
        autoAlpha: 0,
        stagger: 0.1,
      }, "-=0.8")
      // Animate Header Action Buttons
      .from(".header-actions button, .header-actions .btn-lang", {
        duration: 0.8,
        ease: "power2.out",
        y: -15,
        autoAlpha: 0,
        stagger: 0.1,
      }, "-=0.6")
      // Animate Hero Section Glass Chips
      .from(".glass-chip", {
        duration: 0.6,
        ease: "expo.out",
        scale: 0.5,
        autoAlpha: 0,
        stagger: 0.08,
      }, "-=0.5")
      // Animate Split-Text Hero Title characters
      .from(".hero-title .char", {
        duration: 1.2,
        ease: "elastic.out(1, 0.6)",
        x: 20,
        autoAlpha: 0,
        stagger: 0.03,
      }, "-=0.5")
      // Animate Split-Text Hero Subtitle words (random entry)
      .from(".hero-subtitle .word", {
        duration: 1.2,
        ease: "expo.out",
        autoAlpha: 0,
        stagger: {
          amount: 0.6,
          from: "random",
        }
      }, "-=0.8")
      // Animate Search Bar Container
      .from(".search-bar-shell", {
        duration: 1,
        ease: "power3.out",
        y: 25,
        autoAlpha: 0,
      }, "-=0.8");
    };

    const timer = setTimeout(initSplashAnimations, 100);
    return () => clearTimeout(timer);
  }, []);

  // 1. LENIS & STARS BACKGROUND INITIALIZATION (Client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lenisInst = null;

    const initLenisAndStars = () => {
      if (!window.Lenis) {
        setTimeout(initLenisAndStars, 100);
        return;
      }

      const Lenis = window.Lenis;

      // Initialize Lenis Smooth Scroll
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smooth: true,
      });
      lenisInst = lenis;
      window.lenis = lenis;

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Create Stars
      const container = document.getElementById('star-container');
      if (container) {
        container.innerHTML = '';

        const count = 80;
        const stars = [];

        for (let i = 0; i < count; i++) {
          const s = document.createElement('div');
          s.className = 'star';

          const x = Math.random() * 100;
          const y = Math.random() * 100;

          const isStatic = Math.random() < 0.3;
          const z = isStatic ? 0 : 0.2 + Math.random() * 0.6;
          const size = isStatic ? 1 + Math.random() : 1 + Math.random() * 2;

          s.style.left = x + '%';
          s.style.top = y + '%';
          s.style.width = size + 'px';
          s.style.height = size + 'px';

          s.style.setProperty('--duration', (2 + Math.random() * 4) + 's');
          s.style.animationDelay = (Math.random() * 5) + 's';

          container.appendChild(s);
          stars.push({ el: s, initialY: y, speed: z });
        }

        // Warp effect on scroll
        lenis.on('scroll', ({ scroll, velocity }) => {
          const stretch = Math.max(1, Math.min(1 + Math.abs(velocity) * 0.15, 4));

          stars.forEach(star => {
            if (star.speed === 0) {
              star.el.style.transform = 'scaleY(1)';
              return;
            }

            let pos = (star.initialY - (scroll * star.speed * 0.05)) % 100;
            if (pos < 0) pos += 100;

            star.el.style.top = pos + '%';
            star.el.style.transform = `scaleY(${stretch})`;
          });
        });
      }
    };

    initLenisAndStars();

    return () => {
      if (lenisInst) {
        lenisInst.destroy();
        window.lenis = null;
      }
    };
  }, []);

  // Lock background scroll and stop Lenis when detail modal is open or when no search has been made
  useEffect(() => {
    if (selectedItem || !searched) {
      document.body.style.overflow = 'hidden';
      document.documentElement.classList.add('lenis-stopped');
      if (window.lenis) {
        window.lenis.stop();
      }
    } else {
      document.body.style.overflow = '';
      document.documentElement.classList.remove('lenis-stopped');
      if (window.lenis) {
        window.lenis.start();
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.classList.remove('lenis-stopped');
      if (window.lenis) {
        window.lenis.start();
      }
    };
  }, [selectedItem, searched]);

  // 2. INFINITE SCROLL INTERSECTION OBSERVER
  useEffect(() => {
    if (!pager?.hasMore || loadingMore || loading) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        handleLoadMore();
      }
    }, {
      rootMargin: '200px',
    });

    const sentinel = document.getElementById('infinite-scroll-sentinel');
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      observer.disconnect();
    };
  }, [pager, loadingMore, loading, handleLoadMore]);

  // 3. GSAP DIRECT STAGGER ANIMATION FOR POST CARDS (DOM order)
  useEffect(() => {
    if (typeof window === 'undefined' || results.length === 0) return;

    const runGSAPAnimation = () => {
      if (!window.gsap) {
        setTimeout(runGSAPAnimation, 100);
        return;
      }

      const gsap = window.gsap;

      // Target only cards that have not been animated yet
      const unaminatedCards = document.querySelectorAll(".media-card:not([data-animated='true'])");
      if (unaminatedCards.length > 0) {
        // Initial state: subtle y offset and transparent
        gsap.set(unaminatedCards, { y: 20, opacity: 0 });

        // Animate them in DOM order (left-to-right, row-by-row)
        gsap.to(unaminatedCards, {
          opacity: 1,
          y: 0,
          duration: 0.35,
          stagger: 0.05,
          ease: 'power2.out',
          overwrite: 'auto',
          onComplete: () => {
            unaminatedCards.forEach(el => el.setAttribute('data-animated', 'true'));
          }
        });
      }
    };

    // Run after DOM rendering is finished
    const timer = setTimeout(runGSAPAnimation, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [results]);

  const getType = (st) => TYPE_MAP[st] || 'movie';
  const getBadgeClass = (st) => BADGE_CLASS[getType(st)] || 'badge-movie';

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const imgProxy = (url, w = 300) => {
    if (!url) return '';
    return `/api/image?url=${encodeURIComponent(url)}&w=${w}`;
  };

  return (
    <div className={`min-h-screen flex-col ${!searched ? 'landing-active' : ''}`}>
      {/* SPLASH SCREEN */}
      <section className="splash_sec">
        <h1>
          <span className="splash_text">
            <svg id="Layer_2" data-name="Layer 2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 250">
              <text 
                x="50%" 
                y="55%" 
                dominantBaseline="middle" 
                textAnchor="middle" 
                fontSize="120" 
                fontWeight="900" 
                letterSpacing="6"
              >
                <tspan fill="none" stroke="#ffffff" strokeWidth="3.5" className="stroke-danie">DANIE</tspan>
                <tspan fill="none" stroke="#e50914" strokeWidth="3.5" className="stroke-watch">WATCH</tspan>
              </text>
            </svg>
          </span>
        </h1>
      </section>

      {/* Lenis Warp speed stars background */}
      <div id="star-container"></div>

      {/* HEADER */}
      <header className="sticky-header">
        <div className="header-container">
          <a href="#" className="logo-link" onClick={handleLogoClick}>
            <img src="/logo.png" alt="DanieWatch Logo" className="logo-img" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
            <span>Danie<span className="logo-accent">Watch</span></span>
          </a>

          {/* Step indicators in Header */}
          <div className="header-steps">
            <span className="header-step-pill">
              <span className="header-step-num">01</span>
              <span className="header-step-label">Search</span>
              <span className="header-step-arrow">→</span>
            </span>
            <span className="header-step-pill">
              <span className="header-step-num">02</span>
              <span className="header-step-label">Pick Quality</span>
              <span className="header-step-arrow">→</span>
            </span>
            <span className="header-step-pill">
              <span className="header-step-num">03</span>
              <span className="header-step-label">Download</span>
            </span>
          </div>

          <div className="header-actions">
            {/* Fake App button */}
            <button className="btn-primary">
              <svg style={{ width: '16px', height: '16px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
              </svg>
              <span>App</span>
            </button>

            {/* Language Selection */}
            <button className="btn-lang">
              <svg style={{ width: '14px', height: '14px' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span>EN</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="main-wrapper">
        <div className="content-container">
          {/* HERO SECTION */}
          <section className="hero-section">
            {/* Desktop Glass Chips */}
            <div className="glass-chip-wrapper desktop-only-chips">
              <span className="glass-chip">DanieWatch</span>
              <span className="glass-chip">HD MP4</span>
              <span className="glass-chip">Subtitles</span>
            </div>

            {/* Mobile Steps (replacing glass chips on mobile) */}
            <div className="glass-chip-wrapper mobile-only-steps">
              <span className="header-step-pill">
                <span className="header-step-num">01</span>
                <span className="header-step-label">Search</span>
                <span className="header-step-arrow">→</span>
              </span>
              <span className="header-step-pill">
                <span className="header-step-num">02</span>
                <span className="header-step-label">Pick Quality</span>
                <span className="header-step-arrow">→</span>
              </span>
              <span className="header-step-pill">
                <span className="header-step-num">03</span>
                <span className="header-step-label">Download</span>
              </span>
            </div>

            <h1 className="hero-title" data-splitting="true">DanieWatch Video Downloader</h1>
            <p className="hero-subtitle" data-splitting="true">
              Search movies, TV shows, and anime by title, then download HD MP4 videos with subtitle options.
            </p>
          </section>

          {/* SEARCH BAR */}
          <section className="search-form-section">
            <form className="search-form-container" onSubmit={handleSearch} ref={searchInputRef}>
              <div className="search-bar-shell">
                <div className="search-icon-left">
                  <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </div>
                <input
                  id="search-input"
                  className="input-shell"
                  type="text"
                  placeholder="Search video, movie, TV show, or anime title..."
                  value={query}
                  onChange={handleInputChange}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  autoComplete="off"
                />
                <button type="submit" className="search-submit-btn" disabled={loading}>
                  Search
                </button>

                {showSuggestions && suggestions.length > 0 && (
                  <div className="suggestions-panel">
                    {suggestions.map((s, i) => (
                      <div key={i} className="suggestion-row" onClick={() => handleSuggestionClick(s)}>
                        <svg style={{ width: '14px', height: '14px', opacity: 0.6 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>

            {/* Step badges below search bar */}
            <div className="search-steps-hint">
              <span className={`search-step-item ${query.trim() === '' ? 'search-step-item-active' : ''}`}>
                <span className="search-step-circle">1</span>
                <span>Search Title</span>
              </span>
              <span className={`search-step-item ${searched && results.length > 0 && !selectedItem ? 'search-step-item-active' : ''}`}>
                <span className="search-step-circle">2</span>
                <span>Choose Version</span>
              </span>
              <span className={`search-step-item ${selectedItem ? 'search-step-item-active' : ''}`}>
                <span className="search-step-circle">3</span>
                <span>Get MP4</span>
              </span>
            </div>
          </section>

          {/* FILTERS & MODE CONTROLS */}
          {searched && (
            <div className="filters-bar">
              <div className="filter-buttons-group">
                {FILTERS.map(f => (
                  <button
                    key={f.value}
                    className={`filter-pill ${filter === f.value ? 'active' : ''}`}
                    onClick={() => handleFilterChange(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Hide the index feature / admin mode toggle for now */}
              {false && (
                <div className="admin-mode-toggle">
                  <span className="toggle-text">{isAdmin ? 'Admin Mode (Showing All)' : 'User Mode (Show Indexed Only)'}</span>
                  <label className="switch-shell">
                    <input
                      type="checkbox"
                      checked={isAdmin}
                      onChange={(e) => setIsAdmin(e.target.checked)}
                    />
                    <span className="switch-track"></span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ERROR STATUS */}
          {error && (
            <div className="error-alert-banner">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}



          {/* Search result count */}
          {searched && pager && !loading && (
            <div className="results-info-row">
              Found {results.length} results for &ldquo;{query}&rdquo;
            </div>
          )}

          {/* Loading Skeletons */}
          {loading && (
            <div className="results-grid-container">
              <div className="results-grid-layout">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="skeleton-shell">
                    <div className="skeleton-img" />
                    <div className="skeleton-row-1" />
                    <div className="skeleton-row-2" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search results grid */}
          {!loading && results.length > 0 && (
            <div className="results-grid-container">
              <div className="results-grid-layout">
                {results.map((item) => (
                  <div key={item.subjectId} className="media-card" onClick={() => openDetail(item)}>
                    <div className="media-card-poster">
                      {item.cover?.url && (
                        <img
                          src={imgProxy(item.cover.url, 300)}
                          alt={item.title}
                          loading="lazy"
                        />
                      )}
                      <span className={`media-card-badge ${getBadgeClass(item.subjectType)}`}>
                        {getType(item.subjectType)}
                      </span>
                      {item.imdbRatingValue && (
                        <span className="media-card-rating">⭐ {item.imdbRatingValue}</span>
                      )}
                      {isAdmin && (
                        <button
                          className={`media-card-whitelist-btn admin-mode-always ${isItemWhitelisted(item) ? 'already-whitelisted' : ''}`}
                          title={isItemWhitelisted(item) ? "Remove from Curation Index" : "Add to Curation Index"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isItemWhitelisted(item)) {
                              removeFromIndex(item);
                            } else {
                              addToIndex(item);
                            }
                          }}
                        >
                          {isItemWhitelisted(item) ? '✓' : '+'}
                        </button>
                      )}
                    </div>
                    <div className="media-card-info">
                      <div className="media-card-title">{item.title}</div>
                      <div className="media-card-meta">
                        {item.releaseDate && <span>{item.releaseDate.slice(0, 4)}</span>}
                        {item.genre && <span>• {item.genre.split(',').slice(0, 2).join(', ')}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Infinite Scroll Sentinel element */}
              {pager?.hasMore && (
                <div id="infinite-scroll-sentinel" style={{ height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '30px 0' }}>
                  {loadingMore && <div className="download-loading">⏳ Loading more results...</div>}
                </div>
              )}
            </div>
          )}

          {/* Empty search results state */}
          {!loading && searched && results.length === 0 && (
            <div className="empty-illustration-box">
              <div className="icon-symbol">🔍</div>
              <h2>No results found</h2>
              <p>Try turning on Admin Mode or search with a different keyword title.</p>
            </div>
          )}
        </div>
      </main>

      {/* ===== DETAIL MODAL OVERLAY ===== */}
      {selectedItem && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && closeDetail()}>
          <div className="modal-window" data-lenis-prevent>
            <div className="modal-poster-hero">
              {(detail?.subject?.stills?.[0]?.url || selectedItem.cover?.url) && (
                <img
                  src={imgProxy(detail?.subject?.stills?.[0]?.url || selectedItem.cover?.url, 720)}
                  alt={selectedItem.title}
                />
              )}
              <div className="modal-hero-overlay-shadow" />
              <button className="modal-exit-button" onClick={closeDetail}>✕</button>
            </div>

            <div className="modal-content-details">
              {modalError && (
                <div className="error-alert-banner" style={{ marginTop: '16px', marginBottom: '16px' }}>
                  <span>⚠️</span>
                  <span>Failed to load details: {modalError}</span>
                </div>
              )}
              {detailLoading ? (
                <div className="download-loading">Loading details...</div>
              ) : (
                <>
                  <div className="modal-title-row">
                    <h2 className="modal-title-text">
                      {detail?.subject?.title || selectedItem.title}
                    </h2>
                    {isAdmin && (
                      <button
                        className={`modal-whitelist-curate-btn ${isItemWhitelisted(selectedItem) ? 'already-whitelisted' : ''}`}
                        onClick={() => {
                          if (isItemWhitelisted(selectedItem)) {
                            removeFromIndex(selectedItem);
                          } else {
                            addToIndex(selectedItem);
                          }
                        }}
                      >
                        {isItemWhitelisted(selectedItem) ? '✓ Already Whitelisted' : '+ Add to Curation Index'}
                      </button>
                    )}
                  </div>

                  <div className="modal-metadata-strip">
                    {selectedItem.imdbRatingValue && (
                      <span className="modal-metadata-tag rating-colored">⭐ {selectedItem.imdbRatingValue} IMDb</span>
                    )}
                    {selectedItem.releaseDate && <span className="modal-metadata-tag">📅 {selectedItem.releaseDate}</span>}
                    {selectedItem.duration && <span className="modal-metadata-tag">⏱️ {formatDuration(selectedItem.duration)}</span>}
                    {selectedItem.genre && <span className="modal-metadata-tag">🎭 {selectedItem.genre}</span>}
                    {selectedItem.countryName && <span className="modal-metadata-tag">🌍 {selectedItem.countryName}</span>}
                  </div>

                  {(detail?.subject?.description || selectedItem.description) && (
                    <p className="modal-overview-text">
                      {detail?.subject?.description || selectedItem.description}
                    </p>
                  )}

                  {/* CONDITIONAL RENDER: GITHUB CATALOG ITEM (VCLOUD ONLY) vs STANDARD AONEROOM ITEM */}
                  {(() => {
                    const whitelistedEntry = whitelist.find(w => {
                      const parts = String(selectedItem.subjectId).split('_');
                      const tmdbId = parts.length > 2 ? parts[2] : String(selectedItem.subjectId);
                      return String(w[0]) === tmdbId || String(w[3]) === String(selectedItem.subjectId);
                    });
                    const isGithubItem = selectedItem.fromGithubCatalog || String(selectedItem.subjectId).startsWith('github_');
                    return isGithubItem ? (
                      <>
                        {/* VCLOUD SEASONS / EPISODES SELECTORS (ONLY FOR SERIES) */}
                        {vcloudLayoutLoading ? (
                          <div className="download-loading">⏳ Loading show layout...</div>
                        ) : vcloudLayout && (
                          <>
                            <h3 className="modal-subheading">Seasons</h3>
                            <div className="season-selector-tabs">
                              {Object.keys(vcloudLayout)
                                .map(Number)
                                .sort((a, b) => a - b)
                                .map(se => (
                                  <button
                                    key={se}
                                    className={`season-selector-pill ${vcloudSelectedSeason === se ? 'active' : ''}`}
                                    onClick={() => {
                                      setVcloudSelectedSeason(se);
                                      // Auto select first episode of this season
                                      const episodes = vcloudLayout[se] || [];
                                      if (episodes.length > 0) {
                                        setVcloudSelectedEpisode(episodes[0]);
                                      }
                                      setVcloudResolutions(null);
                                      setVcloudServers(null);
                                    }}
                                  >
                                    Season {se}
                                  </button>
                                ))}
                            </div>

                            {(() => {
                              const episodes = vcloudLayout[vcloudSelectedSeason] || [];
                              return (
                                <>
                                  <h3 className="modal-subheading">Episodes</h3>
                                  <div className="episodes-grid-selector">
                                    {episodes.map(ep => (
                                      <button
                                        key={ep}
                                        className={`episode-selector-cell ${vcloudSelectedEpisode === ep ? 'active' : ''}`}
                                        onClick={() => {
                                          setVcloudSelectedEpisode(ep);
                                          setVcloudResolutions(null);
                                          setVcloudServers(null);
                                        }}
                                      >
                                        {ep}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        )}

                        {/* VCLOUD PREMIUM DOWNLOADS SECTION */}
                        <div className="modal-download-area" style={{ marginTop: '20px' }}>
                          <h3 className="modal-subheading" style={{ color: '#e50914', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>⚡</span> Premium Direct Downloads (VCloud Servers)
                          </h3>

                          {vcloudLoading && (
                            <div className="download-loading">⏳ Resolving VCloud resolutions...</div>
                          )}

                          {vcloudError && !vcloudResolutions && (
                            <div style={{ padding: '8px', opacity: 0.7, fontSize: '13px' }}>
                              {vcloudError}
                            </div>
                          )}

                          {vcloudResolutions && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                              {Object.entries(vcloudResolutions).map(([resolution, resObj]) => (
                                <button
                                  key={resolution}
                                  onClick={(e) => handleVcloudExtract(resObj.url, resolution)}
                                  className="btn-load-more"
                                  style={{ 
                                    margin: '4px', 
                                    width: 'auto', 
                                    flex: '1', 
                                    minWidth: '120px', 
                                    background: vcloudExtractingRes === resolution ? '#e50914' : vcloudButtonErrors[resolution] ? '#7f1d1d' : 'rgba(255,255,255,0.05)',
                                    color: 'white',
                                    borderColor: vcloudExtractingRes === resolution ? '#e50914' : vcloudButtonErrors[resolution] ? '#7f1d1d' : 'rgba(255,255,255,0.1)'
                                  }}
                                  disabled={!!vcloudExtractingRes}
                                >
                                  {vcloudExtractingRes === resolution ? `Resolving ${resolution}...` : vcloudButtonErrors[resolution] ? vcloudButtonErrors[resolution] : (resObj.size && resObj.size !== 'Size N/A' ? `${resolution} (${resObj.size})` : resolution)}
                                </button>
                              ))}
                            </div>
                          )}

                        </div>
                      </>
                    ) : (
                      <>
                        {/* STANDARD AONEROOM DOWNLOAD INTERFACE */}
                        {/* SEASON / EPISODE SELECTOR FOR TV/ANIME SHOWS */}
                        {detail?.resource?.seasons && detail.resource.seasons.length > 0 && detail.resource.seasons[0].se > 0 && (
                          <>
                            <h3 className="modal-subheading">Seasons</h3>
                            <div className="season-selector-tabs">
                              {detail.resource.seasons.map(s => (
                                <button
                                  key={s.se}
                                  className={`season-selector-pill ${selectedSeason === s.se ? 'active' : ''}`}
                                  onClick={() => {
                                    setSelectedSeason(s.se);
                                    setSelectedEpisode(1);
                                    setDownloads(null);
                                    fetchDownloads(selectedItem.subjectId, s.se, 1, selectedItem.detailPath);
                                  }}
                                >
                                  Season {s.se}
                                </button>
                              ))}
                            </div>

                            {(() => {
                              const currentSeason = detail.resource.seasons.find(s => s.se === selectedSeason);
                              if (!currentSeason) return null;
                              const maxEp = currentSeason.maxEp || 1;
                              return (
                                <>
                                  <h3 className="modal-subheading">Episodes</h3>
                                  <div className="episodes-grid-selector">
                                    {Array.from({ length: maxEp }, (_, i) => i + 1).map(ep => (
                                      <button
                                        key={ep}
                                        className={`episode-selector-cell ${selectedEpisode === ep ? 'active' : ''}`}
                                        onClick={() => handleEpisodeClick(selectedSeason, ep)}
                                      >
                                        {ep}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              );
                            })()}
                          </>
                        )}

                        {/* Movie Links / TV Load action triggers */}
                        {detail?.resource?.seasons?.[0]?.se === 0 && !downloads && !downloadLoading && (
                          <button
                            className="btn-load-more"
                            style={{ width: '100%', marginTop: '12px' }}
                            onClick={() => fetchDownloads(selectedItem.subjectId, 0, 0, selectedItem.detailPath)}
                          >
                            🔗 Get Download Links
                          </button>
                        )}

                        {detail?.resource?.seasons?.[0]?.se > 0 && !downloads && !downloadLoading && (
                          <button
                            className="btn-load-more"
                            style={{ width: '100%' }}
                            onClick={() => handleEpisodeClick(selectedSeason, selectedEpisode)}
                          >
                            🔗 Get Download Links for S{selectedSeason}E{selectedEpisode}
                          </button>
                        )}

                        {/* DOWNLOAD RESOURCES LIST */}
                        {downloadLoading && (
                          <div className="download-loading">⏳ Fetching download links...</div>
                        )}

                        {downloads && (
                          <div className="modal-download-area">
                            <h3 className="modal-subheading">📥 Download Options {selectedSeason > 0 ? `(S${selectedSeason}E${selectedEpisode})` : ''}</h3>

                            {downloads.error ? (
                              <div style={{ padding: '16px', textAlign: 'center' }}>
                                <p className="not-found-color" style={{ marginBottom: '12px' }}>
                                  Failed to load resolutions: {downloads.error}
                                </p>
                                <button
                                  className="btn-load-more"
                                  style={{ padding: '8px 24px', fontSize: '13px', width: 'auto' }}
                                  onClick={() => fetchDownloads(selectedItem.subjectId, selectedSeason, selectedEpisode, selectedItem.detailPath)}
                                >
                                  🔄 Retry
                                </button>
                              </div>
                            ) : downloads.downloads && downloads.downloads.length > 0 ? (
                              <div className="download-cards-grid">
                                {downloads.downloads.map((dl, i) => {
                                  if (dl.type === 'not_found' || dl.type === 'redirect' || dl.note === 'Opens in OmniSave') {
                                    const isNotFound = dl.type === 'not_found';
                                    return (
                                      <div key={i} className="dl-card-link dl-card-disabled">
                                        <div className="dl-card-details-left">
                                          <div className="dl-card-res">
                                            {dl.resolution}{typeof dl.resolution === 'number' ? 'p' : ''}
                                          </div>
                                          <div className="dl-card-meta-line">
                                            {dl.format?.toUpperCase()} • {dl.size}
                                          </div>
                                          <div className="dl-card-note not-found-color">
                                            {isNotFound ? 'Not Found' : 'Download Unavailable'}
                                          </div>
                                        </div>
                                        <span className="dl-card-icon-right not-found-icon">
                                          ❌
                                        </span>
                                      </div>
                                    );
                                  }
                                  const dlUrl = dl.type === 'redirect' ? dl.url : `/api/stream?url=${encodeURIComponent(dl.url)}&title=${encodeURIComponent(detail?.subject?.title || selectedItem.title)}&res=${dl.resolution}&se=${selectedSeason}&ep=${selectedEpisode}`;
                                  return (
                                    <a
                                      key={i}
                                      className="dl-card-link"
                                      href={dlUrl}
                                      onClick={(e) => {
                                        if (dl.type !== 'redirect') {
                                          triggerDownload(dlUrl, detail?.subject?.title || selectedItem.title, e);
                                        }
                                      }}
                                      target={dl.type === 'redirect' ? "_blank" : undefined}
                                      rel="noopener noreferrer"
                                    >
                                      <div className="dl-card-details-left">
                                        <div className="dl-card-res">
                                          {dl.resolution}{typeof dl.resolution === 'number' ? 'p' : ''}
                                        </div>
                                        <div className="dl-card-meta-line">
                                          {dl.format?.toUpperCase()} • {dl.size}
                                        </div>
                                        {dl.note && (
                                          <div className="dl-card-note">{dl.note}</div>
                                        )}
                                      </div>
                                      <span className="dl-card-icon-right">
                                        {downloadingUrl === dlUrl ? '⏳' : dl.type === 'redirect' ? '🔗' : dl.type === 'stream' ? '▶️' : '⬇'}
                                      </span>
                                    </a>
                                  );
                                })}

                                {/* Dubs if present */}
                                {downloads.downloads[0]?.dubs && downloads.downloads[0].dubs.length > 0 && (
                                  <div className="dl-dubs-strip">
                                    <div className="dl-dubs-title">🌐 Alternative Versions / Languages:</div>
                                    <div className="subtitles-chips-group">
                                      {downloads.downloads[0].dubs.map((dub, i) => (
                                        <button
                                          key={i}
                                          className="subtitle-chip-link"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            fetchDownloads(dub.subjectId, 0, 0, dub.detailPath);
                                          }}
                                        >
                                          {dub.name}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="download-loading">No downloads available.</div>
                            )}

                            {/* SUBTITLES / CAPTIONS */}
                            {downloads.captions && downloads.captions.length > 0 && (
                              <div className="subtitles-area-strip">
                                <h4 className="subtitles-area-title">💬 Subtitles</h4>
                                <div className="subtitles-chips-group">
                                  {downloads.captions.map((cap, i) => {
                                    const capUrl = cap.type === 'redirect' ? cap.url : `/api/stream?url=${encodeURIComponent(cap.url)}&title=${encodeURIComponent(detail?.subject?.title || selectedItem.title)}&res=${cap.lanName || cap.lan}&se=${selectedSeason}&ep=${selectedEpisode}`;
                                    return (
                                      <a
                                        key={i}
                                        className="subtitle-chip-link"
                                        href={capUrl}
                                        onClick={(e) => {
                                          if (cap.type !== 'redirect') {
                                            triggerDownload(capUrl, detail?.subject?.title || selectedItem.title, e);
                                          }
                                        }}
                                        target={cap.type === 'redirect' ? "_blank" : undefined}
                                        rel="noopener noreferrer"
                                      >
                                        {cap.lanName || cap.lan}
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST SYSTEM CONTAINER */}
      <div className="toast-panel-container">
        {notifications.map(n => (
          <div key={n.id} className={`toast-item-card toast-${n.type}`}>
            <span>
              {n.type === 'success' ? '✅' : n.type === 'error' ? '❌' : '⏳'}
            </span>
            <span>{n.message}</span>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <footer className="simple-footer">
        Created by Daniyal with ❤️
      </footer>

      {/* PWA INSTALL FAB */}
      {showInstallBtn && (
        <div className="pwa-install-container">
          {showInstructions && (
            <div className="pwa-instructions-box">
              <div className="pwa-instructions-arrow" />
              <button className="pwa-instructions-close" onClick={() => setShowInstructions(false)}>✕</button>
              <h4 className="pwa-instructions-title">Install DanieWatch</h4>
              
              {platform === 'ios' && (
                <p className="pwa-instructions-text">
                  Tap the Share icon <span className="pwa-instructions-icon-span">📤</span> at the bottom of your Safari browser, then scroll down and select <strong className="pwa-instructions-bold">Add to Home Screen</strong> <span className="pwa-instructions-icon-span">➕</span>.
                </p>
              )}
              
              {platform === 'android' && (
                <p className="pwa-instructions-text">
                  Tap the menu button <span className="pwa-instructions-bold">(three dots)</span> in the top-right corner of Chrome, and select <strong className="pwa-instructions-bold">Install app</strong> or <strong className="pwa-instructions-bold">Add to Home screen</strong>.
                </p>
              )}
              
              {platform === 'desktop' && (
                <p className="pwa-instructions-text">
                  Click the <strong className="pwa-instructions-bold">Install</strong> icon in the address bar (top right of your browser) or open the menu and choose <strong className="pwa-instructions-bold">Save and share → Install app</strong>.
                </p>
              )}
            </div>
          )}
          <button 
            className="pwa-install-fab" 
            onClick={handleInstallClick}
            aria-label="Install App"
          >
            <svg className="pwa-install-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="pwa-install-tooltip">Install</span>
          </button>
        </div>
      )}
    </div>
  );
}
