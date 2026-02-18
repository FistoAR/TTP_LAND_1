/* ═══════════════════════════════════════════════════════
   INTERACTIVE PLOT MAP — UNIFIED SCRIPT
═══════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ══ CONFIG ══════════════════════════════════════════ */
    var SVG_URL = './plot_final_1.svg';
    var STAMP_PREFIX = 'stamp-plot-';

    /* ══ PLOT DATABASE ═══════════════════════════════════
       overlayId  : the clickable SVG element ID
       visibleId  : the colored/filled SVG element ID
                    (if different from overlayId, else leave blank)
       stampNum   : matches stamp-plot-{stampNum} in your SVG
    ════════════════════════════════════════════════════ */
    var plotDB = {
        'Plot1_1': { title: 'Plot 1', plotNum: 1, stampNum: 1, price: 1500000, length: 30, width: 50, sqft: 1500, facing: 'East', status: 'Available' },
        'Plot2_2': { title: 'Plot 2', plotNum: 2, stampNum: 2, price: 1200000, length: 24, width: 50, sqft: 1200, facing: 'North', status: 'Available' },
        'Plot3_3': { title: 'Plot 3', plotNum: 3, stampNum: 3, price: 120000, length: 24, width: 50, sqft: 1200, facing: 'North', status: 'Available' },
        'Plot4_4': { title: 'Plot 4', plotNum: 4, stampNum: 4, price: 150000, length: 30, width: 50, sqft: 1500, facing: 'East', status: 'Available' },
        'Plot5_5': { title: 'Plot 5', plotNum: 5, stampNum: 5, price: 120000, length: 24, width: 50, sqft: 1200, facing: 'North', status: 'Available' },
        'Plot6_6': { title: 'Plot 6', plotNum: 6, stampNum: 6, price: 120000, length: 24, width: 50, sqft: 1200, facing: 'North', status: 'Available' },

    };


    /* ══ STATE ═══════════════════════════════════════════ */
    var inlineSvg = null;
    var origVbX = 0, origVbY = 0, origVbW = 0, origVbH = 0;
    var vbX = 0, vbY = 0, vbW = 0, vbH = 0;

    var MIN_SCALE = 0.8;
    var MAX_SCALE = 3;
    var ZOOM_SPEED = 0.0015;

    var selectedPlot = null;  // the VISIBLE (filled) SVG element
    var originalColor = '';    // fill before we touched it
    var currentPlotId = null;
    var currentStatus = null;

    /* ══ DOM REFS ════════════════════════════════════════ */
    var viewport = document.getElementById('viewport');
    var svgContainer = document.getElementById('svg-container');
    var badge = document.getElementById('zoom-badge');
    var toast = document.getElementById('toast');
    var popup = document.getElementById('popup');
    var loading = document.getElementById('loading');
    var tooltip = document.getElementById('svg-tooltip');
    var fabTrigger = document.getElementById('fab-trigger');
    var floatingMenu = document.getElementById('floating-menu');
    var instList = document.getElementById('instList');
    var instCount = 0;

    /* ══════════════════════════════════════════════════
       TOOLTIP
    ══════════════════════════════════════════════════ */
    function posTT(mx, my) {
        var gap = 12;
        var tw = tooltip.offsetWidth;
        var th = tooltip.offsetHeight;
        var top = my - th - gap;
        if (top < 8) top = my + gap;
        var left = Math.max(8, Math.min(mx - tw / 2, window.innerWidth - tw - 8));
        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
    }

    function showTT(html, mx, my) {
        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.offsetHeight; // force reflow
        posTT(mx, my);
        requestAnimationFrame(function () {
            tooltip.classList.add('visible');
        });
    }

    function hideTT() {
        tooltip.classList.remove('visible');
        setTimeout(function () {
            if (!tooltip.classList.contains('visible')) {
                tooltip.style.display = 'none';
            }
        }, 180);
    }

    /* ══════════════════════════════════════════════════
       HELPERS
    ══════════════════════════════════════════════════ */
    function isOpen() { return popup.classList.contains('show'); }
    function getZoom() { return origVbW / vbW; }
    function clampZ(z) { return Math.min(MAX_SCALE, Math.max(MIN_SCALE, z)); }
    function today() { return new Date().toISOString().split('T')[0]; }

    function applyVB() {
        if (!inlineSvg) return;
        inlineSvg.setAttribute('viewBox', vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH);
        badge.textContent = Math.round(getZoom() * 100) + ' %';
    }

    function s2svg(sx, sy) {
        var r = inlineSvg.getBoundingClientRect();
        return {
            x: vbX + ((sx - r.left) / r.width) * vbW,
            y: vbY + ((sy - r.top) / r.height) * vbH
        };
    }

    /* ══════════════════════════════════════════════════
       TOAST
    ══════════════════════════════════════════════════ */
    var _toastTimer;
    function showToast(msg) {
        toast.textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(function () {
            toast.classList.add('hidden');
        }, 3000);
    }
    setTimeout(function () { toast.classList.add('hidden'); }, 4000);

    /* ══════════════════════════════════════════════════
       TAB SWITCH
    ══════════════════════════════════════════════════ */
    window.switchTab = function (t) {
        ['plot', 'customer'].forEach(function (n) {
            document.getElementById('tab-' + n).classList.toggle('active', n === t);
            document.getElementById('panel-' + n).classList.toggle('active', n === t);
        });
    };

    /* ══════════════════════════════════════════════════
       STAMP HELPERS
    ══════════════════════════════════════════════════ */
    function getStampId(plotId) {
        var d = plotDB[plotId] || {};
        return STAMP_PREFIX + (d.stampNum || d.plotNum || '1');
    }

    function showStamp(plotId) {
        if (!inlineSvg || !plotId) return;
        hideStamp(plotId); // clear any existing first

        var sid = getStampId(plotId);
        var el = inlineSvg.getElementById(sid);

        if (el) {
            el.style.display = '';
            el.setAttribute('opacity', '1');
        } else {
            /* Fallback: draw SOLD text */
            var ref = selectedPlot || inlineSvg.getElementById(plotId);
            if (!ref) return;
            try {
                var bbox = ref.getBBox();
                var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                t.setAttribute('id', '__fstamp__' + plotId);
                t.setAttribute('x', bbox.x + bbox.width / 2);
                t.setAttribute('y', bbox.y + bbox.height / 2);
                t.setAttribute('text-anchor', 'middle');
                t.setAttribute('dominant-baseline', 'middle');
                t.setAttribute('font-size', Math.min(bbox.width, bbox.height) * 0.26 + 'px');
                t.setAttribute('font-weight', '900');
                t.setAttribute('fill', '#fff');
                t.setAttribute('opacity', '0.92');
                t.setAttribute('pointer-events', 'none');
                t.setAttribute('font-family', 'Segoe UI,Arial,sans-serif');
                t.setAttribute('letter-spacing', '2');
                t.textContent = 'SOLD';
                inlineSvg.appendChild(t);
            } catch (err) {
                console.warn('showStamp fallback failed:', err);
            }
        }
    }

    function hideStamp(plotId) {
        if (!inlineSvg) return;
        var d = plotDB[plotId] || {};
        var sid = STAMP_PREFIX + (d.stampNum || d.plotNum || '?');
        var el = inlineSvg.getElementById(sid);
        if (el) el.style.display = 'none';
        var fb = inlineSvg.getElementById('__fstamp__' + (plotId || ''));
        if (fb) fb.remove();
    }

    /* ══════════════════════════════════════════════════
       APPLY INITIAL STATUS COLORS (runs once after SVG loads)
    ══════════════════════════════════════════════════ */
    function applyInitialStatuses() {
        Object.keys(plotDB).forEach(function (plotId) {
            var d = plotDB[plotId];

            /* ── 1. Hide stamp element by default ── */
            var stampEl = inlineSvg.getElementById(STAMP_PREFIX + d.stampNum);
            if (stampEl) stampEl.style.display = 'none';

            /* ── 2. Find the visible (filled) shape element ── */
            var plotEl = d.visibleId
                ? inlineSvg.getElementById(d.visibleId)
                : inlineSvg.getElementById(plotId);

            if (!plotEl) {
                /* Last-resort fallbacks */
                plotEl = inlineSvg.getElementById('Plot-' + d.plotNum)
                    || inlineSvg.getElementById('plot-' + d.plotNum)
                    || inlineSvg.getElementById(plotId);
            }

            if (!plotEl) {
                console.warn('applyInitialStatuses: shape not found for ' + plotId);
                return;
            }

            /* ── 3. Color by status ── */
            var status = (d.status || '').toLowerCase();

            if (status === 'sold') {
                plotEl.setAttribute('fill', '#F48274');
                /* Show stamp */
                if (stampEl) {
                    stampEl.style.display = '';
                    stampEl.setAttribute('opacity', '1');
                } else {
                    /* Fallback SOLD text */
                    try {
                        var bbox = plotEl.getBBox();
                        var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        txt.setAttribute('id', '__fstamp__' + plotId);
                        txt.setAttribute('x', bbox.x + bbox.width / 2);
                        txt.setAttribute('y', bbox.y + bbox.height / 2);
                        txt.setAttribute('text-anchor', 'middle');
                        txt.setAttribute('dominant-baseline', 'middle');
                        txt.setAttribute('font-size', Math.min(bbox.width, bbox.height) * 0.26 + 'px');
                        txt.setAttribute('font-weight', '900');
                        txt.setAttribute('fill', '#fff');
                        txt.setAttribute('opacity', '0.92');
                        txt.setAttribute('pointer-events', 'none');
                        txt.setAttribute('font-family', 'Segoe UI,Arial,sans-serif');
                        txt.setAttribute('letter-spacing', '2');
                        txt.textContent = 'SOLD';
                        inlineSvg.appendChild(txt);
                    } catch (err) {
                        console.warn('Fallback stamp error for ' + plotId, err);
                    }
                }

            } else if (status === 'inprogress' || status === 'in progress' || status === 'in-progress') {
                plotEl.setAttribute('fill', '#FFD253');

            }
            /* 'available' → leave SVG fill as-is (don't touch it) */
        });
    }

    /* ══════════════════════════════════════════════════
       OPEN POPUP
    ══════════════════════════════════════════════════ */
    function openPopup(plotId) {
        currentPlotId = plotId;
        currentStatus = null;
        var d = plotDB[plotId] || {};

        /* Header */
        document.getElementById('phTitle').textContent = (d.title || plotId) + ' Details';
        document.getElementById('phBadge').textContent = (d.title || plotId);

        /* Plot tab */
        document.getElementById('plotNumber').value = d.title || plotId;
        document.getElementById('plotPrice').value = d.price || '';
        document.getElementById('plotLength').value = d.length || '';
        document.getElementById('plotWidth').value = d.width || '';
        document.getElementById('plotSqft').value = d.sqft || '';
        document.getElementById('plotFacing').value = d.facing || '';

        var pba = document.getElementById('priceBadgeAmt');
        pba.textContent = d.price ? '₹' + d.price.toLocaleString('en-IN') : '';

        /* Customer tab */
        document.getElementById('custName').value = '';
        document.getElementById('custPhone').value = '';
        document.getElementById('mediatorSel').value = '';
        document.getElementById('mediatorOther').value = '';
        document.getElementById('mediatorOther').style.display = 'none';
        document.getElementById('closureDate').value = '';

        var bp = document.getElementById('bookingPrice');
        bp.value = '';
        bp.readOnly = false;
        bp.style.background = '';
        document.getElementById('chkPlotPrice').checked = false;

        /* Status buttons — reset */
        document.getElementById('btnReg').classList.remove('on');
        document.getElementById('btnProg').classList.remove('on');

        resetInst();
        switchTab('plot');
        popup.classList.add('show');
    }

    /* ══════════════════════════════════════════════════
       CLOSE POPUP  ← single definition, complete version
    ══════════════════════════════════════════════════ */
    function closePopup() {
        popup.classList.remove('show');

        /* Only restore color if no status was committed */
        if (selectedPlot && originalColor !== '' && !currentStatus) {
            selectedPlot.setAttribute('fill', originalColor);
            hideStamp(currentPlotId);
        }

        selectedPlot = null;
        originalColor = '';
        currentPlotId = null;
        currentStatus = null;
    }

    /* Close bindings */
    document.getElementById('btnClose').addEventListener('click', closePopup);
    popup.addEventListener('click', function (e) { if (e.target === popup) closePopup(); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) closePopup(); });

    /* ══════════════════════════════════════════════════
       SAVE — PLOT TAB
    ══════════════════════════════════════════════════ */
    document.getElementById('btnSavePlot').addEventListener('click', function () {
        if (!currentPlotId) return;
        var d = plotDB[currentPlotId];
        if (!d) return;

        d.price = parseFloat(document.getElementById('plotPrice').value) || d.price;
        d.length = parseFloat(document.getElementById('plotLength').value) || d.length;
        d.width = parseFloat(document.getElementById('plotWidth').value) || d.width;
        d.sqft = parseFloat(document.getElementById('plotSqft').value) || d.sqft;
        d.facing = document.getElementById('plotFacing').value || d.facing;

        closePopup();
        showToast('✅ Plot details saved for ' + d.title);
    });

    /* Auto sq.ft */
    function calcSqft() {
        var l = parseFloat(document.getElementById('plotLength').value) || 0;
        var w = parseFloat(document.getElementById('plotWidth').value) || 0;
        if (l && w) document.getElementById('plotSqft').value = l * w;
    }
    document.getElementById('plotLength').addEventListener('input', calcSqft);
    document.getElementById('plotWidth').addEventListener('input', calcSqft);

    /* ══════════════════════════════════════════════════
       MEDIATOR DROPDOWN
    ══════════════════════════════════════════════════ */
    document.getElementById('mediatorSel').addEventListener('change', function () {
        var show = this.value === 'other';
        document.getElementById('mediatorOther').style.display = show ? 'block' : 'none';
        if (show) document.getElementById('mediatorOther').focus();
    });

    /* ══════════════════════════════════════════════════
       BOOKING PRICE CHECKBOX
    ══════════════════════════════════════════════════ */
    document.getElementById('chkPlotPrice').addEventListener('change', function () {
        var bp = document.getElementById('bookingPrice');
        var pba = document.getElementById('priceBadgeAmt');
        if (currentPlotId && plotDB[currentPlotId]) {
            var price = plotDB[currentPlotId].price;
            pba.textContent = '₹' + price.toLocaleString('en-IN');
            if (this.checked) {
                bp.value = price;
                bp.readOnly = true;
                bp.style.background = '#fff9ee';
            } else {
                bp.readOnly = false;
                bp.value = '';
                bp.style.background = '#ffffff';
            }
        }
    });

    /* ══════════════════════════════════════════════════
       INSTALLMENT ROWS
    ══════════════════════════════════════════════════ */
    function addInstRow() {
        instCount++;
        var n = instCount;
        var row = document.createElement('div');
        row.className = 'irow';
        row.innerHTML =
            '<div class="itop">' +
            '<span class="ino">Entry #' + n + '</span>' +
            '<button class="btnrm" title="Remove">✕</button>' +
            '</div>' +
            '<div class="ifields">' +
            '<div class="fg"><label>Amount Received (₹)</label>' +
            '<input type="number" class="ia" placeholder="₹"></div>' +
            '<div class="fg"><label>Date Received</label>' +
            '<input type="date" class="id" value="' + today() + '"></div>' +
            '<div class="fg"><label>Next Follow-up Date</label>' +
            '<input type="date" class="if"></div>' +
            '</div>';
        row.querySelector('.btnrm').addEventListener('click', function () {
            row.remove();
            instList.querySelectorAll('.ino').forEach(function (el, i) {
                el.textContent = 'Entry #' + (i + 1);
            });
            instCount = instList.querySelectorAll('.irow').length;
        });
        instList.appendChild(row);
    }

    function resetInst() {
        instList.innerHTML = '';
        instCount = 0;
        addInstRow();
    }

    document.getElementById('btnAddInst').addEventListener('click', addInstRow);

    /* ══════════════════════════════════════════════════
       STATUS BUTTONS
    ══════════════════════════════════════════════════ */
    var btnReg = document.getElementById('btnReg');
    var btnProg = document.getElementById('btnProg');

    btnReg.addEventListener('click', function () {
        var on = this.classList.toggle('on');
        btnProg.classList.remove('on');
        if (on) {
            currentStatus = 'registered';
            if (selectedPlot) selectedPlot.setAttribute('fill', '#F48274');
            showStamp(currentPlotId);
        } else {
            currentStatus = null;
            if (selectedPlot) selectedPlot.setAttribute('fill', originalColor);
            hideStamp(currentPlotId);
        }
    });

    btnProg.addEventListener('click', function () {
        var on = this.classList.toggle('on');
        btnReg.classList.remove('on');
        if (on) {
            currentStatus = 'inprogress';
            if (selectedPlot) selectedPlot.setAttribute('fill', '#FFD253');
            hideStamp(currentPlotId);
        } else {
            currentStatus = null;
            if (selectedPlot) selectedPlot.setAttribute('fill', originalColor);
        }
    });

    /* ══════════════════════════════════════════════════
       SAVE — CUSTOMER TAB
    ══════════════════════════════════════════════════ */
    document.getElementById('btnSaveCust').addEventListener('click', function () {
        var name = document.getElementById('custName').value.trim();
        if (!name) { document.getElementById('custName').focus(); return; }

        var phone = document.getElementById('custPhone').value.trim();
        var med = document.getElementById('mediatorSel').value;
        if (med === 'other') med = document.getElementById('mediatorOther').value.trim();
        var price = document.getElementById('bookingPrice').value.trim();
        var closure = document.getElementById('closureDate').value;

        var insts = [];
        instList.querySelectorAll('.irow').forEach(function (r, i) {
            insts.push({
                n: i + 1,
                amt: r.querySelector('.ia').value,
                date: r.querySelector('.id').value,
                fup: r.querySelector('.if').value
            });
        });

        var msg =
            '✅ Saved!\n\n' +
            'Plot: ' + (currentPlotId || '—') + '\n' +
            'Customer: ' + name + '\n' +
            'Phone: ' + (phone || '—') + '\n' +
            'Mediator: ' + (med || '—') + '\n' +
            'Booking: ₹' + (price || '—') + '\n' +
            'Closure: ' + (closure || '—') + '\n' +
            'Status: ' + (currentStatus ? currentStatus.toUpperCase() : 'Not set') + '\n\n';

        insts.forEach(function (inst) {
            msg += 'Entry ' + inst.n + ': ₹' + inst.amt +
                ' | ' + inst.date + ' | Follow-up: ' + inst.fup + '\n';
        });

        alert(msg);
        popup.classList.remove('show');
        selectedPlot = null;
        originalColor = '';
        currentPlotId = null;

        closePopup();
    });

    /* ══════════════════════════════════════════════════
       FLOATING MENU
    ══════════════════════════════════════════════════ */
    fabTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        floatingMenu.classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
        if (!floatingMenu.contains(e.target)) floatingMenu.classList.remove('open');
    });

    document.getElementById('btn-dashboard').addEventListener('click', function () {
        floatingMenu.classList.remove('open');
        alert('Dashboard coming soon!');
    });
    document.getElementById('btn-report').addEventListener('click', function () {
        floatingMenu.classList.remove('open');
        alert('Report coming soon!');
    });
    document.getElementById('btn-mediator').addEventListener('click', function () {
        floatingMenu.classList.remove('open');
        alert('Mediator Data coming soon!');
    });
    document.getElementById('btn-login').addEventListener('click', function () {
        alert('Login coming soon!');
    });

    /* ══════════════════════════════════════════════════
       FETCH SVG → INJECT INLINE
    ══════════════════════════════════════════════════ */
    fetch(SVG_URL)
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
        })
        .then(function (svgText) {
            svgContainer.innerHTML = svgText;
            inlineSvg = svgContainer.querySelector('svg');
            if (!inlineSvg) throw new Error('No <svg> element found in file.');

            if (!inlineSvg.getAttribute('viewBox')) {
                var w = parseFloat(inlineSvg.getAttribute('width') || 700);
                var h = parseFloat(inlineSvg.getAttribute('height') || 500);
                inlineSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
            }

            var vb = inlineSvg.viewBox.baseVal;
            origVbX = vb.x; origVbY = vb.y;
            origVbW = vb.width; origVbH = vb.height;
            vbX = origVbX; vbY = origVbY;
            vbW = origVbW; vbH = origVbH;

            inlineSvg.setAttribute('width', '100%');
            inlineSvg.setAttribute('height', '100%');
            inlineSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            inlineSvg.style.display = 'block';

            /* Order matters: statuses first, then handlers */
            applyInitialStatuses();   // ← colors + stamps from plotDB.status
            setupPlotHandlers();      // ← click / hover wiring

            loading.classList.add('hidden');
            applyVB();
        })
        .catch(function (err) {
            console.error(err);
            loading.innerHTML = '❌ ' + err.message;
        });

    /* ══════════════════════════════════════════════════
       SETUP PLOT CLICK + HOVER HANDLERS
    ══════════════════════════════════════════════════ */
    function setupPlotHandlers() {

        Object.keys(plotDB).forEach(function (plotId) {
            var d = plotDB[plotId];

            /* overlay = clickable element (may be transparent) */
            var overlay = inlineSvg.getElementById(plotId);

            /* visible = the colored/filled shape */
            var visible = (d.visibleId ? inlineSvg.getElementById(d.visibleId) : null)
                || inlineSvg.getElementById('Plot-' + d.plotNum)
                || overlay;   // final fallback

            if (!overlay) {
                console.warn('setupPlotHandlers: overlay not found → ' + plotId);
                return;
            }

            overlay.style.cursor = 'pointer';

            var justTapped = false;

            function handleActivate(e) {
                if (dragMoved > CLICK_THRESH) return;
                e.stopPropagation();

                selectedPlot = visible;

                /*  ★ KEY FIX ★
                    Read originalColor from the CURRENT fill attribute.
                    For 'Sold' plots this will be '#F48274' (set by applyInitialStatuses).
                    For 'Available' plots it will be whatever the SVG originally has.
                    Either way we capture the right value here. */
                originalColor = visible
                    ? (visible.getAttribute('fill') || visible.style.fill || '')
                    : '';

                hideTT();
                openPopup(plotId);
            }

            overlay.addEventListener('touchend', function (e) {
                if (dragMoved > CLICK_THRESH) return;
                justTapped = true;
                setTimeout(function () { justTapped = false; }, 500);
                handleActivate(e);
            });

            overlay.addEventListener('click', function (e) {
                if (justTapped) return;
                handleActivate(e);
            });

            /* Tooltip */
            overlay.addEventListener('mouseenter', function (e) {
                if (isOpen()) return;
                var sc = d.status === 'Available' ? '#5ee87a' : '#ff8080';
                showTT(
                    '<strong style="font-size:14px;">' + d.title + '</strong><br>' +
                    '📐 ' + d.sqft + ' sq.ft (' + d.length + ' × ' + d.width + ' ft)<br>' +
                    '💰 ₹' + d.price.toLocaleString('en-IN') + '<br>' +
                    '🧭 Facing: ' + d.facing + '<br>' +
                    '📋 <span style="color:' + sc + ';font-weight:700;">' + d.status + '</span>',
                    e.clientX, e.clientY
                );
            });

            overlay.addEventListener('mousemove', function (e) {
                if (isOpen() || tooltip.style.display === 'none') return;
                posTT(e.clientX, e.clientY);
            });

            overlay.addEventListener('mouseleave', hideTT);
        });
    }

    /* ══════════════════════════════════════════════════
       ZOOM & PAN
    ══════════════════════════════════════════════════ */
    function zoomAt(f, sx, sy) {
        var cz = getZoom(), nz = clampZ(cz * f), af = nz / cz;
        var pt = s2svg(sx, sy);
        var nW = vbW / af, nH = vbH / af;
        var rx = (pt.x - vbX) / vbW, ry = (pt.y - vbY) / vbH;
        vbX = pt.x - rx * nW;
        vbY = pt.y - ry * nH;
        vbW = nW; vbH = nH;
        applyVB();
    }

    function zoomC(f) {
        var r = inlineSvg.getBoundingClientRect();
        zoomAt(f, r.left + r.width / 2, r.top + r.height / 2);
    }

    function resetV() { vbX = origVbX; vbY = origVbY; vbW = origVbW; vbH = origVbH; applyVB(); }
    function fitV() {
        var p = 0.02;
        vbX = origVbX - origVbW * p; vbY = origVbY - origVbH * p;
        vbW = origVbW * (1 + p * 2); vbH = origVbH * (1 + p * 2);
        applyVB();
    }

    /* Wheel */
    viewport.addEventListener('wheel', function (e) {
        e.preventDefault();
        if (isOpen() || !inlineSvg) return;
        zoomAt(Math.min(3, Math.max(0.1, 1 + (-e.deltaY * ZOOM_SPEED))), e.clientX, e.clientY);
    }, { passive: false });

    /* Mouse drag */
    var dragging = false, dsx = 0, dsy = 0, dvx = 0, dvy = 0;
    var dragMoved = 0;
    var CLICK_THRESH = 4;

    viewport.addEventListener('mousedown', function (e) {
        if (e.button !== 0 || isOpen() || !inlineSvg) return;
        dragging = true;
        dsx = e.clientX; dsy = e.clientY;
        dvx = vbX; dvy = vbY;
        dragMoved = 0;
        viewport.classList.add('is-dragging');
        e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
        if (!dragging || !inlineSvg) return;
        var dx = e.clientX - dsx, dy = e.clientY - dsy;
        dragMoved = Math.abs(dx) + Math.abs(dy);
        var r = inlineSvg.getBoundingClientRect();
        vbX = dvx - (dx / r.width) * vbW;
        vbY = dvy - (dy / r.height) * vbH;
        applyVB();
    });

    window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        viewport.classList.remove('is-dragging');
    });

    viewport.addEventListener('click', function (e) {
        if (dragMoved > CLICK_THRESH) { e.stopPropagation(); e.preventDefault(); }
    }, true);

    /* Touch */
    var ltd = 0, lmx = 0, lmy = 0, tsx = 0, tsy = 0, tvx = 0, tvy = 0;

    function tdist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

    viewport.addEventListener('touchstart', function (e) {
        if (isOpen() || !inlineSvg) return;
        e.preventDefault();
        if (e.touches.length === 2) {
            ltd = tdist(e.touches[0], e.touches[1]);
            lmx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            lmy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        } else {
            tsx = e.touches[0].clientX; tsy = e.touches[0].clientY;
            tvx = vbX; tvy = vbY; dragMoved = 0;
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', function (e) {
        if (isOpen() || !inlineSvg) return;
        e.preventDefault();
        if (e.touches.length === 2) {
            var d = tdist(e.touches[0], e.touches[1]);
            var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            if (ltd > 0) {
                zoomAt(d / ltd, mx, my);
                var r = inlineSvg.getBoundingClientRect();
                vbX -= ((mx - lmx) / r.width) * vbW;
                vbY -= ((my - lmy) / r.height) * vbH;
                applyVB();
            }
            ltd = d; lmx = mx; lmy = my;
        } else {
            var dx = e.touches[0].clientX - tsx, dy = e.touches[0].clientY - tsy;
            dragMoved = Math.abs(dx) + Math.abs(dy);
            var r2 = inlineSvg.getBoundingClientRect();
            vbX = tvx - (dx / r2.width) * vbW;
            vbY = tvy - (dy / r2.height) * vbH;
            applyVB();
        }
    }, { passive: false });

    viewport.addEventListener('touchend', function () { ltd = 0; });

    /* Keyboard */
    window.addEventListener('keydown', function (e) {
        if (isOpen() || !inlineSvg) return;
        var s = vbW * 0.08;
        switch (e.key) {
            case '+': case '=': zoomC(1.2); break;
            case '-': case '_': zoomC(0.83); break;
            case '0': resetV(); break;
            case 'ArrowUp': vbY -= s; applyVB(); e.preventDefault(); break;
            case 'ArrowDown': vbY += s; applyVB(); e.preventDefault(); break;
            case 'ArrowLeft': vbX -= s; applyVB(); e.preventDefault(); break;
            case 'ArrowRight': vbX += s; applyVB(); e.preventDefault(); break;
        }
    });

    /* Toolbar buttons */
    document.getElementById('btn-zoom-in').addEventListener('click', function () { if (inlineSvg) zoomC(1.3); });
    document.getElementById('btn-zoom-out').addEventListener('click', function () { if (inlineSvg) zoomC(0.77); });
    document.getElementById('btn-fit').addEventListener('click', function () { if (inlineSvg) fitV(); });

})();