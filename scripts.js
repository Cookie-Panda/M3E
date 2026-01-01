    const audio = new Audio();
    let state = {
        list: [], favs: new Set(), idx: 0, playing: false, 
        shuffle: false, repeat: false, filter: false,
        dirHandle: null, dragSrc: null
    };

    const ui = {
        title: document.getElementById('track-title'), artist: document.getElementById('track-artist'),
        cover: document.getElementById('cover-img'), time: document.getElementById('time-txt'),
        seeker: document.getElementById('seeker'), pCont: document.getElementById('p-container'),
        mask: document.getElementById('wave-mask'), line: document.getElementById('straight-line'),
        thumb: document.getElementById('thumb'), playIcon: document.getElementById('play-icon'),
        favBtn: document.getElementById('btn-fav'), list: document.getElementById('list-box'),
        plSheet: document.getElementById('playlist-sheet'), lyrSheet: document.getElementById('lyrics-sheet'),
        lyrBox: document.getElementById('lyrics-box'), bg: document.getElementById('sheet-bg'),
        toast: document.getElementById('toast'), legacyInput: document.getElementById('legacy-input')
    };

    /* --- PERFORMANCE: Lazy Load Observer --- */
    const artObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const realIdx = parseInt(img.dataset.realIdx);
                const item = state.list[realIdx];

                if (item && !img.dataset.loaded) {
                    loadListArt(item, img);
                    observer.unobserve(img); // Stop watching once loaded
                }
            }
        });
    }, { root: ui.list, rootMargin: '100px' }); // Load images 100px before they appear

    window.onload = async () => {
        const f = localStorage.getItem('vibe_favs');
        if(f) state.favs = new Set(JSON.parse(f));
        try {
            const h = await getDB('handle');
            if(h) { state.dirHandle = h; ui.toast.classList.add('show'); }
        } catch(e) {}
        initDragClose('playlist-sheet', 'drag-playlist');
        initDragClose('lyrics-sheet', 'drag-lyrics');
    };

    async function pickFolder() {
        if (window.showDirectoryPicker) {
            try {
                const h = await window.showDirectoryPicker();
                await setDB('handle', h); state.dirHandle = h; loadFiles(h);
            } catch(e) {}
        } else { ui.legacyInput.click(); }
    }

    async function restoreFolder() {
        ui.toast.classList.remove('show');
        if(!state.dirHandle) return;
        if ((await state.dirHandle.requestPermission({mode:'read'})) === 'granted') loadFiles(state.dirHandle);
    }

    ui.legacyInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('audio/'));
        if(files.length) {
            state.list = files.map(f => ({ name: f.name.replace(/\.[^.]+$/, ""), srcObj: f, isHandle: false, cachedArt: null }));
            finishLoading();
        }
    });

    async function loadFiles(handle) {
        state.list = []; ui.title.innerText = "Scanning...";
        for await (const e of handle.values()) {
            if(e.kind==='file' && /\.(mp3|wav|ogg|m4a)$/i.test(e.name)) {
                state.list.push({ name: e.name.replace(/\.[^.]+$/, ""), srcObj: e, isHandle: true, cachedArt: null });
            }
        }
        finishLoading();
    }

    function finishLoading() {
        if(state.list.length) {
            state.list.sort((a,b)=>a.name.localeCompare(b.name));
            state.idx=0; loadTrack(0); renderList(); togglePlaylist(false);
        } else { ui.title.innerText = "No music found"; }
    }

    async function loadTrack(i) {
        if(!state.list[i]) return;
        const item = state.list[i];
        
        // Stop any pending heavy UI updates
        
        let blob = item.isHandle ? await item.srcObj.getFile() : item.srcObj;
        audio.src = URL.createObjectURL(blob);
        
        ui.title.innerText = item.name;
        ui.artist.innerText = "Unknown Artist";
        
        // --- Main Player Metadata (Priority) ---
        jsmediatags.read(blob, {
            onSuccess: (tag) => {
                const t = tag.tags;
                if(t.title) ui.title.innerText = t.title;
                if(t.artist) ui.artist.innerText = t.artist;
                
                // Load Cover Art
                if(t.picture) {
                    const data = t.picture.data;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
                    const src = `data:${t.picture.format};base64,${window.btoa(base64String)}`;
                    
                    ui.cover.src = src;
                    ui.cover.onload = () => {
                        ui.cover.classList.add('loaded');
                        document.querySelector('.cover-art').classList.add('has-art');
                    };
                    // Cache this for the list too!
                    item.cachedArt = src;
                } else { 
                    resetCover();
                }
                
                if(t.lyrics) ui.lyrBox.innerText = t.lyrics.lyrics || t.lyrics;
                else ui.lyrBox.innerHTML = '<div class="lyrics-placeholder">No lyrics available</div>';
            },
            onError: () => { 
                resetCover();
                ui.lyrBox.innerHTML = '<div class="lyrics-placeholder">No lyrics available</div>';
            }
        });

        const isFav = state.favs.has(item.name);
        ui.favBtn.classList.toggle('active', isFav);
        ui.favBtn.querySelector('span').classList.toggle('filled', isFav);

        renderList(); // Refresh active state in list
        if(state.playing) audio.play();
    }

    function resetCover() {
        ui.cover.src = ""; 
        ui.cover.classList.remove('loaded');
        document.querySelector('.cover-art').classList.remove('has-art');
    }

    /* --- OPTIMIZED RENDER LIST (With Lazy Load) --- */
    function renderList() {
        // Disconnect old observer to prevent memory leaks
        artObserver.disconnect();
        ui.list.innerHTML = '';
        
        const isFavView = state.filter;
        const data = isFavView ? state.list.filter(x => state.favs.has(x.name)) : state.list;
        
        if(!data.length) { 
            ui.list.innerHTML='<div style="opacity:0.5;text-align:center;padding:20px">Empty</div>'; 
            return; 
        }
        
        const fragment = document.createDocumentFragment();

        data.forEach((x, i) => {
            const realIdx = state.list.indexOf(x);
            const el = document.createElement('div');
            el.className = `list-item ${realIdx === state.idx ? 'playing' : ''}`;
            el.draggable = true;
            el.dataset.index = i; // Virtual index for swapping

            // --- Drag Events ---
            el.ondragstart = (e) => { 
                state.dragSrc = i; 
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                const img = new Image(); img.src = ''; e.dataTransfer.setDragImage(img, 0, 0);
            };
            el.ondragover = (e) => { e.preventDefault(); handleAutoScroll(e); };
            el.ondragenter = (e) => {
                e.preventDefault();
                const currentChildren = Array.from(ui.list.children);
                const targetIndex = currentChildren.indexOf(el);
                const srcIndex = currentChildren.indexOf(document.querySelector('.dragging'));
                if (srcIndex !== -1 && targetIndex !== -1 && srcIndex !== targetIndex) {
                    performSmoothSwap(srcIndex, targetIndex, data);
                }
            };
            el.ondragend = () => { 
                state.dragSrc = null;
                el.classList.remove('dragging');
                Array.from(ui.list.children).forEach(child => child.style.transform = '');
                stopAutoScroll();
            };
            el.onclick = (e) => { 
                if(e.target.classList.contains('list-drag-handle')) return; 
                state.idx = realIdx; loadTrack(realIdx); togglePlaylist(false); 
            };

            // HTML
            el.innerHTML = `
                <span class="material-symbols-rounded list-drag-handle">drag_indicator</span>
                <div class="list-thumb">
                    <span class="material-symbols-rounded">album</span> 
                    <img id="thumb-${realIdx}" alt="art" data-real-idx="${realIdx}">
                </div>
                <div class="list-info">
                    <div class="list-name">${x.name}</div>
                    <div class="list-artist">Unknown</div>
                </div>
                ${state.favs.has(x.name) ? '<span class="material-symbols-rounded filled" style="font-size:20px; color: var(--md-sys-color-primary);">star</span>' : ''}
            `;
            
            fragment.appendChild(el);
            
            // Observe the image for Lazy Loading
            const img = el.querySelector('img');
            if(x.cachedArt) {
                // If we already have art, show it instantly
                img.src = x.cachedArt;
                img.classList.add('show');
                img.dataset.loaded = "true";
            } else {
                // Otherwise, wait until it scrolls into view
                artObserver.observe(img);
            }
        });

        ui.list.appendChild(fragment);
    }

    /* --- ARTWORK LOADER (Helper) --- */
    function loadListArt(item, imgElement) {
        // Double check cache
        if (item.cachedArt) {
            imgElement.src = item.cachedArt;
            imgElement.classList.add('show');
            return;
        }

        const fileOrBlob = item.isHandle ? item.srcObj.getFile() : Promise.resolve(item.srcObj);
        
        fileOrBlob.then(blob => {
            jsmediatags.read(blob, {
                onSuccess: (tag) => {
                    const t = tag.tags;
                    if(t.picture) {
                        const data = t.picture.data;
                        let base64String = "";
                        for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
                        const finalSrc = `data:${t.picture.format};base64,${window.btoa(base64String)}`;
                        
                        // Save to cache so we never read this file again
                        item.cachedArt = finalSrc;
                        
                        // Update UI
                        imgElement.src = finalSrc;
                        imgElement.classList.add('show');
                        imgElement.dataset.loaded = "true";
                    }
                },
                onError: () => {} // Keep placeholder
            });
        });
    }

    /* --- SMOOTH SWAP LOGIC --- */
    function performSmoothSwap(srcIdx, targetIdx, currentData) {
        const children = Array.from(ui.list.children);
        const srcNode = children[srcIdx];
        const targetNode = children[targetIdx];

        // 1. FLIP: First
        const firstTops = new Map();
        children.forEach(c => firstTops.set(c, c.getBoundingClientRect().top));

        // 2. DOM Swap
        srcIdx < targetIdx ? targetNode.after(srcNode) : targetNode.before(srcNode);

        // 3. Data Update
        const draggedItem = currentData[srcIdx]; 
        const realSrcIdx = state.list.indexOf(draggedItem);
        
        state.list.splice(realSrcIdx, 1);
        
        // Recalculate target index in main list
        const targetItem = currentData[targetIdx];
        // If we insert before/after, we need the stable index
        let realTargetIdx = state.list.indexOf(targetItem);
        
        // Edge case correction for insertion
        if (srcIdx < targetIdx) realTargetIdx++; 
        
        // Insert (simplified for robustness)
        // Note: For perfect sort stability, we just re-insert relative to the target's current main index
        // But for visual consistency:
        const newRealIdx = state.list.indexOf(targetItem); 
        state.list.splice(srcIdx < targetIdx ? newRealIdx + 1 : newRealIdx, 0, draggedItem);


        // Fix Playing Index
        const playingSong = currentData.find((_, i) => children[i].classList.contains('playing'));
        if(playingSong) state.idx = state.list.indexOf(playingSong);

        // 4. FLIP: Invert & Play
        children.forEach(c => {
            const d = firstTops.get(c) - c.getBoundingClientRect().top;
            if (d !== 0) {
                c.style.transition = 'none';
                c.style.transform = `translateY(${d}px)`;
                c.getBoundingClientRect(); // reflow
                c.style.transition = 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)';
                c.style.transform = '';
            }
        });
        state.dragSrc = targetIdx;
    }

    function togglePlay() {
        if(!state.list.length) return;
        if(state.playing) {
            audio.pause(); state.playing=false;
            ui.playIcon.innerText='play_arrow'; ui.pCont.classList.remove('playing');
        } else {
            audio.play(); state.playing=true;
            ui.playIcon.innerText='pause'; ui.pCont.classList.add('playing');
        }
    }

    function skip(d) {
        if(!state.list.length) return;
        if(d===-1 && audio.currentTime>3) { audio.currentTime=0; return; }
        
        let queue = state.filter ? state.list.filter(x=>state.favs.has(x.name)) : state.list;
        let currentInQueue = queue.findIndex(x => x.name === state.list[state.idx].name);
        if(currentInQueue === -1) currentInQueue = 0;

        let nextIndex;
        if(state.shuffle) nextIndex = Math.floor(Math.random() * queue.length);
        else nextIndex = (currentInQueue + d + queue.length) % queue.length;
        
        state.idx = state.list.indexOf(queue[nextIndex]);
        loadTrack(state.idx);
    }

    function toggleFav() {
        if(!state.list.length) return;
        const n = state.list[state.idx].name;
        if(state.favs.has(n)) state.favs.delete(n); else state.favs.add(n);
        localStorage.setItem('vibe_favs', JSON.stringify([...state.favs]));
        
        const isFav = state.favs.has(n);
        ui.favBtn.classList.toggle('active', isFav);
        ui.favBtn.querySelector('span').classList.toggle('filled', isFav);
        renderList();
    }

    audio.ontimeupdate = () => {
        if(!audio.duration) return;
        const p = (audio.currentTime/audio.duration)*100;
        ui.seeker.value = p;
        ui.mask.style.width = `${p}%`;
        ui.thumb.style.left = `${p}%`;
        ui.line.style.setProperty('--thumb-pos', `${p}%`);
        const m=Math.floor(audio.currentTime/60), s=Math.floor(audio.currentTime%60);
        ui.time.innerText = `${m}:${s<10?'0':''}${s}`;
    };
    ui.seeker.oninput = e => audio.currentTime = (e.target.value/100)*audio.duration;
    audio.onended = () => state.repeat ? audio.play() : skip(1);

    function closeAllSheets() { ui.plSheet.classList.remove('show'); ui.lyrSheet.classList.remove('show'); ui.bg.classList.remove('show'); }
    function togglePlaylist(show) { closeAllSheets(); if(show) { ui.plSheet.classList.add('show'); ui.bg.classList.add('show'); } }
    function toggleLyrics(show) { if(!state.list.length)return; closeAllSheets(); if(show) { ui.lyrSheet.classList.add('show'); ui.bg.classList.add('show'); } }
    
    function toggleShuffle() { state.shuffle=!state.shuffle; document.getElementById('btn-shuffle').classList.toggle('active'); }
    function toggleRepeat() { state.repeat=!state.repeat; document.getElementById('btn-repeat').classList.toggle('active'); }
    function toggleFilter() { state.filter=!state.filter; document.getElementById('btn-filter').classList.toggle('active'); renderList(); }

    function initDragClose(sid, hid) {
        const s = document.getElementById(sid), h = document.getElementById(hid);
        let startY = 0;
        h.addEventListener('touchstart', e => startY = e.touches[0].clientY);
        h.addEventListener('touchmove', e => {
            const d = e.touches[0].clientY - startY;
            if(d > 0) s.style.transform = `translateY(${d}px)`;
        });
        h.addEventListener('touchend', e => {
            const d = e.changedTouches[0].clientY - startY;
            s.style.transform = ''; if(d > 100) closeAllSheets();
        });
    }

    /* --- DB & Scrolling --- */
    const dbP = new Promise((res, rej) => {
        const r = indexedDB.open('VibeDB', 1);
        r.onupgradeneeded = e => e.target.result.createObjectStore('store');
        r.onsuccess = e => res(e.target.result);
        r.onerror = rej;
    });
    async function setDB(k,v) { (await dbP).transaction('store','readwrite').objectStore('store').put(v,k); }
    async function getDB(k) { return new Promise(async r => { const q = (await dbP).transaction('store').objectStore('store').get(k); q.onsuccess=()=>r(q.result); }); }
    
    let scrollInterval;
    function handleAutoScroll(e) {
        const list = ui.list;
        const rect = list.getBoundingClientRect();
        const threshold = 60; 
        const speed = 8; 

        clearInterval(scrollInterval);
        if (e.clientY < rect.top + threshold) {
            scrollInterval = setInterval(() => list.scrollTop -= speed, 16);
        } else if (e.clientY > rect.bottom - threshold) {
            scrollInterval = setInterval(() => list.scrollTop += speed, 16);
        }
    }
    function stopAutoScroll() { clearInterval(scrollInterval); }