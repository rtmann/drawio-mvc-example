// drawio-embed.js
// Encapsulates draw.io embed + autosave + navigation logic using Alpine.js component factory.
(function(){
    const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
    const BLANK_XML = () => '<mxfile host="app.diagrams.net" modified="'+ new Date().toISOString() +'" agent="drawiomvc" version="24.7.0" type="device">'
        + '<diagram id="blank" name="Page-1"><mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';

    function hashContent(xml){
        return xml.length + ':' + (xml.match(/<mxCell/g)||[]).length;
    }

    window.drawioComponent = function(){
        return {
            // State
            hasDiagram:false,
            showModal:false,
            name:'',
            pending:false,
            toasts:[],
            currentFileName:null,
            lastSavedHash:null,
            saveTimer:null,
            userInitiatedSave:false,
            pendingExitAfterSave:false,
            pendingDiagramLoad:null,
            editorReady:false,
            frame:null,
            originalXml:null,

            // Alpine lifecycle
            initialize(){
                this.frame = document.getElementById('drawio-frame');
                if(!this.frame) return;
                window.addEventListener('message', (evt)=> this.onMessage(evt));
                // Delegate clicks from nav (which lives outside this component's DOM scope)
                if(!window._drawioNavHandler){
                    window._drawioNavHandler = (e) => {
                        const link = e.target.closest('#drawio-diagram-list a[data-diagram-url]');
                        if(!link) return;
                        e.preventDefault();
                        const file = link.getAttribute('data-filename');
                        const url = link.getAttribute('data-diagram-url');
                        this.openExisting(file, url);
                    };
                    document.addEventListener('click', window._drawioNavHandler);
                }
                // Expose for potential external interactions
                window._drawioComponent = this;
            },

            // Messaging
            onMessage(evt){
                if(evt.origin !== DRAWIO_ORIGIN) return;
                if(!evt.data || typeof evt.data !== 'string') return;
                let msg; try{ msg = JSON.parse(evt.data); }catch{ return; }
                switch(msg.event){
                    case 'init':
                        this.editorReady = true;
                        if(!this.hasDiagram){
                            this.post({ action:'load', xml: BLANK_XML(), autosave:1, saveAndExit:1 });
                        }
                        if(this.pendingDiagramLoad){
                            const { xml, fileName } = this.pendingDiagramLoad; this.pendingDiagramLoad=null; this.performDiagramLoad(xml, fileName);
                        }
                        break;
                    case 'load':
                        // Attempt several fit calls to ensure large / slow diagrams center
                        this.scheduleFit();
                        break;
                    case 'autosave':
                        if(msg.xml) this.queueSave(msg.xml);
                        break;
                    case 'save':
                        this.userInitiatedSave = true;
                        if(msg.xml) this.persistImmediate(msg.xml, true);
                        this.post({ action:'export', format:'xml', spin:'Saving diagram...' });
                        break;
                    case 'export':
                        if(msg.format==='xml' && msg.data) this.persistImmediate(msg.data, this.userInitiatedSave);
                        break;
                    case 'exit':
                        if(this.userInitiatedSave) this.pendingExitAfterSave = true; else this.performReturnToWelcome();
                        break;
                }
            },

            post(message){
                if(this.frame && this.frame.contentWindow){
                    this.frame.contentWindow.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
                }
            },

            // Diagram actions
            openExisting(fileName, url){
                this.hasDiagram = true;
                this.currentFileName = fileName;
                document.querySelectorAll('#drawio-diagram-list a.active').forEach(a=>a.classList.remove('active'));
                // mark clicked link active if present
                const sel = `#drawio-diagram-list a[data-filename='${CSS.escape(fileName)}']`;
                const link = document.querySelector(sel); if(link) link.classList.add('active');
                this.loadDiagramByUrl(url, fileName);
            },
            async loadDiagramByUrl(url, fileName){
                try {
                    const resp = await fetch(url, { cache:'no-cache' });
                    if(!resp.ok) throw new Error(resp.status + ' ' + resp.statusText);
                    const xml = await resp.text();
                    if(!xml.includes('<mxfile')) console.warn('Not a draw.io mxfile');
                    const processed = this.autoNormalizeIfFarOffset(xml);
                    if(!this.editorReady) this.pendingDiagramLoad = { xml: processed, fileName }; else this.performDiagramLoad(processed, fileName);
                }catch(err){ console.error('Failed to load diagram', err); }
            },
            performDiagramLoad(xml, fileName){
                this.lastSavedHash = null;
                this.originalXml = xml; // keep a copy for potential normalization
                this.post({ action:'load', xml, autosave:1, saveAndExit:1, title:fileName });
                this.scheduleFit(100);
            },

            // Saving
            queueSave(xml){
                if(!this.currentFileName) return;
                const h = hashContent(xml);
                if(h === this.lastSavedHash) return;
                clearTimeout(this.saveTimer);
                this.saveTimer = setTimeout(()=> this.doSave(xml, h), 400);
            },
            async doSave(xml, hash){
                try{
                    const resp = await fetch('/DrawIo/Save',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fileName:this.currentFileName, xml })});
                    if(resp.ok) this.lastSavedHash = hash; else console.warn('Save failed', resp.status);
                }catch(e){ console.error('Save error', e); }
            },
            async persistImmediate(xml, ack){
                const h = hashContent(xml);
                if(h === this.lastSavedHash && !ack){ if(ack) this.post({action:'saved'}); return; }
                try{
                    if(this.currentFileName){
                        const resp = await fetch('/DrawIo/Save',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fileName:this.currentFileName, xml })});
                        if(resp.ok){
                            this.lastSavedHash = h;
                            if(ack){
                                this.post({action:'saved'});
                                this.userInitiatedSave = false;
                                if(this.pendingExitAfterSave){ this.pendingExitAfterSave=false; this.performReturnToWelcome(); }
                            }
                        } else console.warn('Immediate save failed', resp.status);
                    }
                }catch(e){ console.error('Immediate save error', e); }
            },
            performReturnToWelcome(){
                this.currentFileName = null; this.lastSavedHash=null; this.hasDiagram=false;
                document.querySelectorAll('#drawio-diagram-list a.active').forEach(a=>a.classList.remove('active'));
            },

            // Modal & toast UI
            openModal(){ this.name=''; this.showModal=true; document.body.classList.add('modal-open'); this.$nextTick(()=> this.$refs.nameInput?.focus()); },
            closeModal(){ this.showModal=false; document.body.classList.remove('modal-open'); },
            toast(message,type='info'){ const id=crypto.randomUUID(); this.toasts.push({id,message,type}); },
            autoHide(t){ setTimeout(()=>this.removeToast(t.id), 3000); },
            removeToast(id){ this.toasts = this.toasts.filter(x=>x.id!==id); },

            // Re-centering helpers
            scheduleFit(initialDelay){
                const delays = [initialDelay ?? 50, 250, 600, 1200, 2000, 3000];
                delays.forEach(d => setTimeout(()=> this.post({ action:'fit' }), d));
            },

            // Attempt to translate all geometry x/y so smallest positive x/y is near margin.
            normalizePositions(){
                if(!this.originalXml){ this.toast('No diagram loaded','error'); return; }
                let xml = this.originalXml;
                try{
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xml,'text/xml');
                    const geoms = Array.from(doc.getElementsByTagName('mxGeometry'));
                    if(!geoms.length){ this.toast('Nothing to normalize','info'); return; }
                    let minX = Infinity, minY = Infinity; let count=0;
                    for(const g of geoms){
                        const x = parseFloat(g.getAttribute('x')||'');
                        const y = parseFloat(g.getAttribute('y')||'');
                        if(!isNaN(x)) { if(x < minX) minX = x; count++; }
                        if(!isNaN(y)) { if(y < minY) minY = y; }
                    }
                    if(minX === Infinity && minY === Infinity){ this.toast('No positioned cells','info'); return; }
                    // Only shift if clearly offset from origin
                    const margin = 40;
                    const shiftX = (minX > margin) ? (minX - margin) : 0;
                    const shiftY = (minY > margin) ? (minY - margin) : 0;
                    if(shiftX === 0 && shiftY === 0){ this.toast('Already near origin','info'); return; }
                    for(const g of geoms){
                        const x = parseFloat(g.getAttribute('x')||'');
                        const y = parseFloat(g.getAttribute('y')||'');
                        if(!isNaN(x) && shiftX) g.setAttribute('x', (x - shiftX).toString());
                        if(!isNaN(y) && shiftY) g.setAttribute('y', (y - shiftY).toString());
                    }
                    const serializer = new XMLSerializer();
                    const newXml = serializer.serializeToString(doc.documentElement);
                    // Re-wrap if needed (mxfile maybe root) - serializer may keep the same root
                    const wrapped = newXml.startsWith('<mxfile') ? newXml : xml; // fallback if parse changed root unexpectedly
                    this.performDiagramLoad(wrapped, this.currentFileName||'');
                    this.toast('Diagram normalized','success');
                }catch(e){ console.error('Normalize failed', e); this.toast('Normalize error','error'); }
            },

            autoNormalizeIfFarOffset(xml){
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(xml,'text/xml');
                    const geoms = Array.from(doc.getElementsByTagName('mxGeometry'));
                    if(!geoms.length) return xml;
                    let minX = Infinity, minY = Infinity;
                    for(const g of geoms){
                        const x = parseFloat(g.getAttribute('x')||'');
                        const y = parseFloat(g.getAttribute('y')||'');
                        if(!isNaN(x) && x < minX) minX = x;
                        if(!isNaN(y) && y < minY) minY = y;
                    }
                    if(minX === Infinity && minY === Infinity) return xml;
                    // Always shift if outside a small margin window
                    if(minX < 0 || minY < 0 || minX > 40 || minY > 40){
                        const shiftX = (minX < 0 ? minX : (minX - 40));
                        const shiftY = (minY < 0 ? minY : (minY - 40));
                        for(const g of geoms){
                            const x = parseFloat(g.getAttribute('x')||'');
                            const y = parseFloat(g.getAttribute('y')||'');
                            if(!isNaN(x)) g.setAttribute('x', (x - shiftX).toString());
                            if(!isNaN(y)) g.setAttribute('y', (y - shiftY).toString());
                        }
                        const serializer = new XMLSerializer();
                        const newXml = serializer.serializeToString(doc.documentElement);
                        const finalXml = newXml.startsWith('<mxfile') ? newXml : xml;
                        // Persist immediately so file stays normalized for next loads
                        if(this.currentFileName){
                            this.persistImmediate(finalXml, false);
                        }
                        this.toast('Normalized positions','success');
                        return finalXml;
                    }
                }catch(e){ /* ignore */ }
                return xml;
            },

            async create(){
                if(!this.name.trim()) return; this.pending=true;
                try{
                    const res = await fetch('/DrawIo/Create',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name:this.name })});
                    const data = await res.json();
                    if(!data.success){ this.toast(data.message||'Failed','error'); }
                    else {
                        this.toast('Diagram created','success');
                        // Add nav item
                        const list = document.getElementById('drawio-diagram-list');
                        if(list){
                            const li = document.createElement('li');
                            li.className='nav-item';
                            li.innerHTML = `<a class="nav-link" href="#" data-diagram-url="${data.url}" data-filename="${data.fileName}">${data.title}</a>`;
                            list.appendChild(li);
                            // Ensure Alpine processes new x-on (force re-scan not trivial). Instead load directly.
                            this.openExisting(data.fileName, data.url);
                        }
                        this.closeModal();
                    }
                }catch(e){ console.error(e); this.toast('Error creating diagram','error'); }
                finally{ this.pending=false; }
            }
        };
    };
})();
