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
    window.switchTab = function (t) { ["plot", "customer", "mediator"].forEach(function (n) { document.getElementById("tab-" + n).classList.toggle("active", n === t); document.getElementById("panel-" + n).classList.toggle("active", n === t); }); };

    window.switchDashTab = function (t) {
        ["customer", "mediator", "plot"].forEach(function (n) {
            document.getElementById("dtab-" + n).classList.toggle("active", n === t);
            document.getElementById("dpanel-" + n).classList.toggle("active", n === t);
        });
    };


    /* ══════════════════════════════════════════════════
   STAMP HELPERS
══════════════════════════════════════════════════ */
    function getStampId(plotId) {
        var d = plotDB[plotId] || {};
        return STAMP_PREFIX + (d.stampNum || d.plotNum || '1');
    }

    /* ── Hide only the TOP-LEVEL stamp element (not children) ── */
    function hideStampEl(el) {
        if (!el) return;
        el.style.display = 'none';
        el.setAttribute('opacity', '0');
    }

    /* ── Show stamp element + ALL its descendants ── */
    function showStampEl(el) {
        if (!el) return;
        el.style.display = '';
        el.style.visibility = 'visible';
        el.setAttribute('opacity', '1');
        el.removeAttribute('display');

        /* Reset all children — they may have been hidden by a previous hideStampEl call */
        el.querySelectorAll('*').forEach(function (child) {
            child.style.display = '';
            child.style.visibility = 'visible';
            child.removeAttribute('display');
        });
    }

    function showStamp(plotId) {
        if (!inlineSvg || !plotId) return;
        hideStamp(plotId); // clear any existing first

        var sid = getStampId(plotId);
        var el = inlineSvg.getElementById(sid);

        if (el) {
            showStampEl(el);
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
        if (el) hideStampEl(el);
        var fb = inlineSvg.getElementById('__fstamp__' + (plotId || ''));
        if (fb) fb.remove();
    }

    /* ══════════════════════════════════════════════════
       APPLY INITIAL STATUS COLORS
    ══════════════════════════════════════════════════ */
    function applyInitialStatuses() {

        /* ── 0. Hide ONLY direct/top-level stamp elements ──
           Strategy: find all [id^="stamp-plot-"] but ONLY hide those
           that are NOT already inside another stamp-plot-* element.
           This prevents hiding nested children that belong to a parent stamp. */
        if (inlineSvg) {
            var allStamps = inlineSvg.querySelectorAll('[id^="' + STAMP_PREFIX + '"]');
            allStamps.forEach(function (el) {
                /* Check if this element has a stamp ancestor — if yes, skip it */
                var ancestor = el.parentElement;
                var isNested = false;
                while (ancestor && ancestor !== inlineSvg) {
                    if (ancestor.id && ancestor.id.indexOf(STAMP_PREFIX) === 0) {
                        isNested = true;
                        break;
                    }
                    ancestor = ancestor.parentElement;
                }
                /* Only hide top-level stamps, not nested ones */
                if (!isNested) {
                    hideStampEl(el);
                }
            });
        }

        Object.keys(plotDB).forEach(function (plotId) {
            var d = plotDB[plotId];

            var stampEl = inlineSvg.getElementById(STAMP_PREFIX + d.stampNum);

            /* ── Find the visible (filled) shape element ── */
            var plotEl = d.visibleId
                ? inlineSvg.getElementById(d.visibleId)
                : inlineSvg.getElementById(plotId);

            if (!plotEl) {
                plotEl = inlineSvg.getElementById('Plot-' + d.plotNum)
                    || inlineSvg.getElementById('plot-' + d.plotNum)
                    || inlineSvg.getElementById(plotId);
            }

            if (!plotEl) {
                console.warn('applyInitialStatuses: shape not found for ' + plotId);
                return;
            }

            /* ── Color by status ── */
            var status = (d.status || '').toLowerCase();

            if (status === 'sold') {
                plotEl.setAttribute('fill', '#F48274');
                if (stampEl) {
                    showStampEl(stampEl); // ← shows parent + all children
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
            /* 'available' → leave SVG fill as-is */
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
    document.getElementById('plotNumber').value  = d.title || plotId;
    document.getElementById('plotPrice').value   = d.price || '';
    document.getElementById('plotLength').value  = d.length || '';
    document.getElementById('plotWidth').value   = d.width || '';
    document.getElementById('plotSqft').value    = d.sqft || '';
    document.getElementById('plotFacing').value  = d.facing || '';
 
    var pba = document.getElementById('priceBadgeAmt');
    pba.textContent = d.price ? '₹' + d.price.toLocaleString('en-IN') : '';
 
    /* Customer tab */
    document.getElementById('custName').value  = '';
    document.getElementById('custPhone').value = '';
    document.getElementById('mediatorSel').value       = '';
    document.getElementById('mediatorOther').value     = '';
    document.getElementById('mediatorOther').style.display = 'none';
    document.getElementById('closureDate').value = '';
 
    var bp = document.getElementById('bookingPrice');
    bp.value    = '';
    bp.readOnly = false;
    bp.style.background = '';
    document.getElementById('chkPlotPrice').checked = false;
 
    /* ── Reset booking checkbox ── */
    var chk = document.getElementById('chkBookingDone');
    chk.checked = false;
    document.getElementById('bookingChkLabel').classList.remove('is-booked');
    // document.getElementById('bookingStatusText').textContent = 'Reserved (In Progress)';
    // document.getElementById('bookingBadge').textContent = '🔖 Reserved';
 
    /* Set initial color to yellow (reserved) when popup opens */
    if (selectedPlot) {
        originalColor = selectedPlot.getAttribute('fill') || '';
        selectedPlot.setAttribute('fill', '#FFD253');
    }
    currentStatus = 'inprogress';
 
    resetInst();
    resetMedTab();
    syncMedToCustomerDropdown();
    switchTab('plot');
    popup.classList.add('show');
}
    /* ══════════════════════════════════════════════════
       CLOSE POPUP  ← single definition, complete version
    ══════════════════════════════════════════════════ */
   function closePopup() {
    popup.classList.remove('show');
 
    /* Restore color only if no status was committed */
    if (selectedPlot && originalColor !== '' && !currentStatus) {
        selectedPlot.setAttribute('fill', originalColor);
        hideStamp(currentPlotId);
    }
 
    /* If status was set to inprogress but not saved,
       revert to original if plot was Available */
    if (selectedPlot && currentStatus === 'inprogress') {
        var d = plotDB[currentPlotId] || {};
        if (d.status === 'Available') {
            selectedPlot.setAttribute('fill', originalColor);
        }
    }
 
    selectedPlot   = null;
    originalColor  = '';
    currentPlotId  = null;
    currentStatus  = null;
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

    // /* ══════════════════════════════════════════════════
    //    STATUS BUTTONS
    // ══════════════════════════════════════════════════ */
    // var btnReg = document.getElementById('btnReg');
    // var btnProg = document.getElementById('btnProg');

    // btnReg.addEventListener('click', function () {
    //     var on = this.classList.toggle('on');
    //     btnProg.classList.remove('on');
    //     if (on) {
    //         currentStatus = 'registered';
    //         if (selectedPlot) selectedPlot.setAttribute('fill', '#F48274');
    //         showStamp(currentPlotId);
    //     } else {
    //         currentStatus = null;
    //         if (selectedPlot) selectedPlot.setAttribute('fill', originalColor);
    //         hideStamp(currentPlotId);
    //     }
    // });

    // btnProg.addEventListener('click', function () {
    //     var on = this.classList.toggle('on');
    //     btnReg.classList.remove('on');
    //     if (on) {
    //         currentStatus = 'inprogress';
    //         if (selectedPlot) selectedPlot.setAttribute('fill', '#FFD253');
    //         hideStamp(currentPlotId);
    //     } else {
    //         currentStatus = null;
    //         if (selectedPlot) selectedPlot.setAttribute('fill', originalColor);
    //     }
    // });

    /* ══════════════════════════════════════════════════
       SAVE — CUSTOMER TAB
    ══════════════════════════════════════════════════ */
    document.getElementById('btnSaveCust').addEventListener('click', function () {

        /* ── Collect values from modal fields ── */
        var custName = document.getElementById('custName').value.trim();
        var custPhone = document.getElementById('custPhone').value.trim();
        var bookingAmt = document.getElementById('bookingPrice').value.trim();
        var closureDate = document.getElementById('closureDate').value;

        /* ── Mediator: dropdown or typed ── */
        var mediatorSel = document.getElementById('mediatorSel').value;
        var mediatorOther = document.getElementById('mediatorOther').value.trim();
        var mediator = mediatorSel === 'other'
            ? mediatorOther
            : mediatorSel;

        /* ── Status ── */
        var status = '';
        if (document.getElementById('btnReg').classList.contains('active')) {
            status = 'register';
        } else if (document.getElementById('btnProg').classList.contains('active')) {
            status = 'progress';
        }

        /* ── Installments ── */
        var installments = [];
        var instRows = document.querySelectorAll('#instList .inst-row');
        instRows.forEach(function (row) {
            var amt = row.querySelector('.inst-amount');
            var date = row.querySelector('.inst-date');
            if (amt && amt.value) {
                installments.push({
                    amount: amt.value,
                    date: date ? date.value : ''
                });
            }
        });

        /* ── Validation ── */
        if (!custName) {
            document.getElementById('custName').focus();
            return;
        }

        /* ── Build data object ── */
        var customerData = {
            customerName: custName,
            customerPhone: custPhone,
            mediator: mediator,
            bookingAmount: bookingAmt,
            closureDate: closureDate,
            status: status,
            installments: installments,
            plotLabel: ''  // plot name from popup title
        };

        /* ── Add to dashboard table ── */
        addCustomerToTable(customerData);

        /* ── Close modal ── */
        closePopup();
    });

    

    /* ══════════════════════════════════════════════════
    DASHBOARD BUTTON + POPUP
 ══════════════════════════════════════════════════ */
    var dashPopup = document.getElementById('dashboard-popup');
    var dashClose = document.getElementById('dash-close');
    var btnDashboard = document.getElementById('btn-dashboard');

    function openDashboard() {
        dashPopup.classList.add('show');
        renderCustomerTable();
        renderMediatorDashTable();
        renderPlotDashTable();
    }

    function closeDashboard() {
        dashPopup.classList.remove('show');
    }

    /* Open */
    btnDashboard.addEventListener('click', function () {
        openDashboard();
    });

    /* Close button */
    dashClose.addEventListener('click', closeDashboard);

    /* Click outside card */
    dashPopup.addEventListener('click', function (e) {
        if (e.target === dashPopup) closeDashboard();
    });

    /* Escape key */
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && dashPopup.classList.contains('show')) {
            closeDashboard();
        }
    });

    var customerStore = [
        {
            customerName: 'Ramesh Kumar',
            customerPhone: '9876543210',
            mediator: 'Anbu',
            bookingAmount: '150000',
            closureDate: '2025-03-15',
            status: 'register',
            installments: [
                { amount: '50000', date: '2025-01-10' },
                { amount: '50000', date: '2025-02-10' },
                { amount: '50000', date: '2025-03-10' }
            ],
            plotLabel: 'Plot 1'
        },
        {
            customerName: 'Suresh Babu',
            customerPhone: '9865321470',
            mediator: 'Babu',
            bookingAmount: '120000',
            closureDate: '2025-04-20',
            status: 'progress',
            installments: [
                { amount: '60000', date: '2025-02-01' },
                { amount: '60000', date: '2025-03-01' }
            ],
            plotLabel: 'Plot 2'
        },
        {
            customerName: 'Priya Lakshmi',
            customerPhone: '9944112233',
            mediator: 'Chandru',
            bookingAmount: '200000',
            closureDate: '2025-05-10',
            status: 'register',
            installments: [
                { amount: '100000', date: '2025-01-20' },
                { amount: '100000', date: '2025-04-20' }
            ],
            plotLabel: 'Plot 3'
        },
        {
            customerName: 'Arun Selvam',
            customerPhone: '9788556644',
            mediator: 'Dinesh',
            bookingAmount: '175000',
            closureDate: '2025-06-30',
            status: 'progress',
            installments: [
                { amount: '75000', date: '2025-03-05' },
                { amount: '50000', date: '2025-04-05' },
                { amount: '50000', date: '2025-05-05' }
            ],
            plotLabel: 'Plot 4'
        },
        {
            customerName: 'Kavitha Devi',
            customerPhone: '9600123456',
            mediator: '',
            bookingAmount: '90000',
            closureDate: '2025-07-15',
            status: 'progress',
            installments: [
                { amount: '45000', date: '2025-04-01' },
                { amount: '45000', date: '2025-06-01' }
            ],
            plotLabel: 'Plot 5'
        },
        {
            customerName: 'Vijay Anand',
            customerPhone: '9345678901',
            mediator: 'Ganesh',
            bookingAmount: '250000',
            closureDate: '2025-02-28',
            status: 'register',
            installments: [
                { amount: '100000', date: '2025-01-01' },
                { amount: '100000', date: '2025-02-01' },
                { amount: '50000', date: '2025-02-28' }
            ],
            plotLabel: 'Plot 6'
        },
        {
            customerName: 'Meena Kumari',
            customerPhone: '9123456789',
            mediator: 'Anbu',
            bookingAmount: '130000',
            closureDate: '2025-08-01',
            status: 'progress',
            installments: [
                { amount: '65000', date: '2025-05-01' },
                { amount: '65000', date: '2025-07-01' }
            ],
            plotLabel: 'Plot 7'
        },
        {
            customerName: 'Karthi Raja',
            customerPhone: '9811223344',
            mediator: 'Babu',
            bookingAmount: '310000',
            closureDate: '2025-09-10',
            status: 'register',
            installments: [
                { amount: '110000', date: '2025-03-10' },
                { amount: '100000', date: '2025-06-10' },
                { amount: '100000', date: '2025-09-10' }
            ],
            plotLabel: 'Plot 8'
        },
        {
            customerName: 'Sangeetha Raj',
            customerPhone: '9922334455',
            mediator: 'Ezhil',
            bookingAmount: '180000',
            closureDate: '2025-10-20',
            status: 'progress',
            installments: [
                { amount: '90000', date: '2025-06-20' },
                { amount: '90000', date: '2025-09-20' }
            ],
            plotLabel: 'Plot 9'
        },
        {
            customerName: 'Dinesh Prabhu',
            customerPhone: '9700112233',
            mediator: '',
            bookingAmount: '95000',
            closureDate: '2025-11-05',
            status: 'progress',
            installments: [
                { amount: '50000', date: '2025-07-05' },
                { amount: '45000', date: '2025-10-05' }
            ],
            plotLabel: 'Plot 10'
        }
    ];

    /* Render immediately with dummy data */
    // renderCustomerTable();

    /*
     * Call this after btnSaveCust is clicked successfully.
     * Pass the data object collected from the modal fields.
     */
    function addCustomerToTable(data) {
        customerStore.push(data);
        renderCustomerTable();
    }

    function renderCustomerTable() {
        filterDashTable('customer');
    }

    function renderCustomerRows(data) {
        var tbody = document.getElementById('customerTableBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#aaa;padding:28px 0;font-size:13px;">No customers found.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        data.forEach(function (c, i) {
            var statusHTML = '';
            if (c.status === 'register') {
                statusHTML = '<span class="tstatus active">🏛 Registered</span>';
            } else if (c.status === 'progress') {
                statusHTML = '<span class="tstatus inactive">🔖 In Progress</span>';
            } else {
                statusHTML = '<span class="tstatus" style="background:#f0f0f0;color:#888;">—</span>';
            }
            var bookingDisplay = c.bookingAmount ? '₹' + Number(c.bookingAmount).toLocaleString('en-IN') : '—';
            var closureDisplay = '—';
            if (c.closureDate) {
                var d = new Date(c.closureDate);
                closureDisplay = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            }
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + (i + 1) + '</td>' +
                '<td>' + escapeHTML(c.customerName || '—') + '</td>' +
                '<td>' + escapeHTML(c.customerPhone || '—') + '</td>' +
                '<td><strong>' + escapeHTML(c.plotLabel || '—') + '</strong></td>' +
                '<td>' + bookingDisplay + '</td>' +
                '<td>' + (c.mediator ? escapeHTML(c.mediator.charAt(0).toUpperCase()) + '</span>' + escapeHTML(c.mediator) : '<span style="color:#aaa;">—</span>') + '</td>' +
                '<td>' + closureDisplay + '</td>' +
                '<td>' + statusHTML + '</td>' +
                '<td><button class="dtab-view-btn" data-idx="' + customerStore.indexOf(c) + '">👁 View</button></td>';
            tr.querySelector('.dtab-view-btn').addEventListener('click', function () {
                openInstModal(parseInt(this.getAttribute('data-idx')));
            });
            tbody.appendChild(tr);
        });
    }

    /* ── Installment Modal ── */
    function openInstModal(idx) {
        var c = customerStore[idx];
        if (!c) return;
        document.getElementById('inst-modal-customer').textContent =
            (c.customerName || '—') + ' · ' + (c.plotLabel || '—');
        var tbody = document.getElementById('inst-modal-tbody');
        tbody.innerHTML = '';
        var total = 0;
        if (!c.installments || c.installments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:20px;">No installments recorded.</td></tr>';
        } else {
            c.installments.forEach(function (inst, i) {
                var amt = parseFloat(inst.amount) || 0;
                total += amt;
                var tr = document.createElement('tr');
                tr.innerHTML =
                    '<td>' + (i + 1) + '</td>' +
                    '<td>₹' + amt.toLocaleString('en-IN') + '</td>' +
                    '<td>' + (inst.date || '—') + '</td>' +
                    '<td>' + (inst.followUp || '—') + '</td>';
                tbody.appendChild(tr);
            });
        }
        document.getElementById('inst-modal-total').innerHTML =
            '<strong>Total Paid: ₹' + total.toLocaleString('en-IN') + '</strong>';
        document.getElementById('inst-modal').classList.add('show');
    }

    document.getElementById('inst-modal-close').addEventListener('click', function () {
        document.getElementById('inst-modal').classList.remove('show');
    });
    document.getElementById('inst-modal').addEventListener('click', function (e) {
        if (e.target === this) this.classList.remove('show');
    });

    /* ── Mediator Dashboard Table ── */
    function renderMediatorDashTable() {
        filterDashTable('mediator');
    }

    function renderMediatorRows(data) {
        var tbody = document.getElementById('mediatorDashBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:28px 0;font-size:13px;">No mediators found.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        data.forEach(function (m, i) {
            var tr = document.createElement('tr');
            var initial = m.name ? m.name.charAt(0).toUpperCase() : '?';
            tr.innerHTML =
                '<td>' + (i + 1) + '</td>' +
                '<td>' + escapeHTML(m.name) + '</td>' +
                '<td>' + escapeHTML(m.phone || '—') + '</td>' +
                '<td>' + escapeHTML(m.location || '—') + '</td>';
            tbody.appendChild(tr);
        });
    }

    /* ── Plot Price Dashboard Table ── */
    function renderPlotDashTable() {
        filterDashTable('plot');
    }

    function renderPlotRows(data) {
        var tbody = document.getElementById('plotDashBody');
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:28px 0;font-size:13px;">No plots found.</td></tr>';
            return;
        }
        tbody.innerHTML = '';
        data.forEach(function (p, i) {
            var statusColor = p.status === 'sold' ? '#F48274' : p.status === 'inprogress' ? '#FFD253' : '#5ee87a';
            var statusLabel = p.status === 'sold' ? '🏛 Sold' : (p.status === 'inprogress' ? '🔖 In Progress' : '✅ Available');
            var tr = document.createElement('tr');
            tr.innerHTML =
                '<td>' + (i + 1) + '</td>' +
                '<td><strong>' + escapeHTML(p.title || '—') + '</strong></td>' +
                '<td>₹' + (p.price ? Number(p.price).toLocaleString('en-IN') : '—') + '</td>' +
                '<td>' + (p.length || '—') + '</td>' +
                '<td>' + (p.width || '—') + '</td>' +
                '<td>' + (p.sqft || '—') + '</td>' +
                '<td>' + escapeHTML(p.facing || '—') + '</td>' +
                '<td><span class="tstatus" style="background:' + statusColor + '20;color:' + statusColor + ';border:1px solid ' + statusColor + '40;">' + statusLabel + '</span></td>';
            tbody.appendChild(tr);
        });
    }

    /* ── Filter & Search ── */
    window.filterDashTable = function (tab) {
        if (tab === 'customer') {
            var q = (document.getElementById('cust-search').value || '').toLowerCase();
            var sf = (document.getElementById('cust-status-filter').value || '');
            var filtered = customerStore.filter(function (c) {
                var match = !q ||
                    (c.customerName || '').toLowerCase().includes(q) ||
                    (c.customerPhone || '').toLowerCase().includes(q) ||
                    (c.plotLabel || '').toLowerCase().includes(q) ||
                    (c.mediator || '').toLowerCase().includes(q);
                var statusMatch = !sf || c.status === sf;
                return match && statusMatch;
            });
            renderCustomerRows(filtered);
        } else if (tab === 'mediator') {
            var q2 = (document.getElementById('med-search').value || '').toLowerCase();
            var filtered2 = knownMediators.filter(function (m) {
                return !q2 ||
                    (m.name || '').toLowerCase().includes(q2) ||
                    (m.phone || '').toLowerCase().includes(q2) ||
                    (m.location || '').toLowerCase().includes(q2);
            });
            renderMediatorRows(filtered2);
        } else if (tab === 'plot') {
            var q3 = (document.getElementById('plot-search').value || '').toLowerCase();
            var ff = (document.getElementById('plot-facing-filter').value || '');
            var allPlots = Object.values(plotDB);
            var filtered3 = allPlots.filter(function (p) {
                var match = !q3 || (p.title || '').toLowerCase().includes(q3);
                var facingMatch = !ff || p.facing === ff;
                return match && facingMatch;
            });
            renderPlotRows(filtered3);
        }
    };
    window.filterDashTable = window.filterDashTable; // expose

    /* ── Excel Export ── */
    window.exportToExcel = function (tab) {
        var rows = [], headers = [], filename = '';
        if (tab === 'customer') {
            headers = ['S.No.', 'Customer Name', 'Phone', 'Plot', 'Booking Amount', 'Mediator', 'Closure Date', 'Status'];
            filename = 'Customer_Details.csv';
            customerStore.forEach(function (c, i) {
                rows.push([
                    i + 1,
                    c.customerName || '',
                    c.customerPhone || '',
                    c.plotLabel || '',
                    c.bookingAmount || '',
                    c.mediator || '',
                    c.closureDate || '',
                    c.status || ''
                ]);
            });
        } else if (tab === 'mediator') {
            headers = ['S.No.', 'Mediator Name', 'Phone Number', 'Location'];
            filename = 'Mediator_Details.csv';
            knownMediators.forEach(function (m, i) {
                rows.push([i + 1, m.name || '', m.phone || '', m.location || '']);
            });
        } else if (tab === 'plot') {
            headers = ['S.No.', 'Plot Number', 'Plot Price', 'Length (ft)', 'Width (ft)', 'Sq. Feet', 'Plot Facing', 'Status'];
            filename = 'Plot_Price_Details.csv';
            Object.values(plotDB).forEach(function (p, i) {
                rows.push([i + 1, p.title || '', p.price || '', p.length || '', p.width || '', p.sqft || '', p.facing || '', p.status || '']);
            });
        }
        var csv = [headers].concat(rows).map(function (r) {
            return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\n');
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        showToast('✅ Exported ' + filename);
    };

    /* Prevent XSS from user-typed input */
    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }



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

                /* 🔒 AUTH GATE */
                if (!isLoggedIn) {
                    return;
                }

                selectedPlot = visible;
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


    // login js

    /* ══════════════════════════════════════════════════
       AUTH — USERS DATABASE
       Add/edit credentials here
    ══════════════════════════════════════════════════ */
    var USERS = {
        'admin': { password: 'admin123', displayName: 'Admin' },
    };

    /* ── Auth state ── */
    var isLoggedIn = false;
    var currentUser = null;   /* { username, displayName } */

    /* ── DOM refs ── */
    var loginModal = document.getElementById('login-modal');
    var loginClose = document.getElementById('login-close');
    var loginSubmit = document.getElementById('login-submit');
    var loginUsername = document.getElementById('login-username');
    var loginPassword = document.getElementById('login-password');
    var loginError = document.getElementById('login-error');
    var loginBtnText = document.getElementById('login-btn-text');
    var loginSpinner = document.getElementById('login-spinner');
    var togglePwd = document.getElementById('toggle-password');
    var btnLogin = document.getElementById('btn-login');
    var btnProfile = document.getElementById('btn-profile');
    var btnProfileAvt = document.getElementById('btn-profile-avatar');
    var btnProfileName = document.getElementById('btn-profile-name');
    var profileDropdown = document.getElementById('profile-dropdown');
    var profileAvatar = document.getElementById('profile-avatar');
    var profileName = document.getElementById('profile-name');
    var btnLogout = document.getElementById('btn-logout');
    // var lockBanner      = document.getElementById('lock-banner');

    /* ══ OPEN / CLOSE LOGIN MODAL ══ */
    function openLoginModal() {
        loginUsername.value = '';
        loginPassword.value = '';
        loginError.classList.remove('show');
        loginModal.classList.add('show');
        setTimeout(function () { loginUsername.focus(); }, 100);
    }

    function closeLoginModal() {
        loginModal.classList.remove('show');
    }

    /* ══ PERFORM LOGIN ══ */
    function doLogin() {
        var uname = loginUsername.value.trim().toLowerCase();
        var pwd = loginPassword.value;

        /* Show spinner */
        loginBtnText.style.display = 'none';
        loginSpinner.style.display = 'inline-block';
        loginError.classList.remove('show');

        /* Simulate slight delay for UX */
        setTimeout(function () {
            loginBtnText.style.display = '';
            loginSpinner.style.display = 'none';

            if (USERS[uname] && USERS[uname].password === pwd) {
                /* ✅ SUCCESS */
                currentUser = { username: uname, displayName: USERS[uname].displayName };
                isLoggedIn = true;
                setLoginSession(currentUser, true);
                closeLoginModal();
                setLoggedInUI();
            } else {
                /* ❌ FAIL */
                loginError.classList.add('show');
                loginPassword.value = '';
                loginPassword.focus();
                setLoginSession(null, false);
            }
        }, 600);
    }

    function setLoginSession(username, bool) {
        if (bool) sessionStorage.setItem("user", JSON.stringify(currentUser));
        else sessionStorage.removeItem("user");
    }

    function getUserInfo() {
        return sessionStorage.getItem("user");
    }

    function checkLogin() {
        const login_ = getUserInfo();
        if (login_) {
            isLoggedIn = true;
            setLoggedInUI();
        }
    }

    checkLogin();

    /* ══ SET UI AFTER LOGIN ══ */
    function setLoggedInUI() {
        const currentUser1 = getUserInfo();
        const currentUser = JSON.parse(currentUser1);
        var initial = (currentUser?.displayName || 'U').charAt(0).toUpperCase();

        /* Navbar: hide login btn, show profile btn */
        btnLogin.style.display = 'none';
        btnProfile.style.display = 'flex';
        btnProfileAvt.textContent = initial;
        btnProfileName.textContent = currentUser?.displayName;

        /* Dropdown */
        profileAvatar.textContent = initial;
        profileName.textContent = currentUser?.displayName;

        /* Lock banner */
        // lockBanner.classList.add('hidden');

        /* Body class */
        document.body.classList.remove('not-logged-in');
        document.body.classList.add('logged-in');
    }

    /* ══ LOGOUT ══ */
    function doLogout() {
        isLoggedIn = false;
        currentUser = null;

        /* Navbar: show login btn, hide profile btn */
        btnLogin.style.display = '';
        btnProfile.style.display = 'none';
        profileDropdown.classList.remove('show');

        /* Lock banner */
        // lockBanner.classList.remove('hidden');

        /* Body class */
        document.body.classList.add('not-logged-in');
        document.body.classList.remove('logged-in');
    }

    /* ══ INITIAL STATE — not logged in ══ */
    document.body.classList.add('not-logged-in');

    /* ══ EVENT LISTENERS ══ */

    /* Open modal */
    btnLogin.addEventListener('click', openLoginModal);

    /* Close modal */
    loginClose.addEventListener('click', closeLoginModal);
    loginModal.addEventListener('click', function (e) {
        if (e.target === loginModal) closeLoginModal();
    });

    /* Submit on button */
    loginSubmit.addEventListener('click', doLogin);

    /* Submit on Enter key */
    loginUsername.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { loginPassword.focus(); }
    });
    loginPassword.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { doLogin(); }
    });

    /* Escape closes modal */
    window.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (loginModal.classList.contains('show')) closeLoginModal();
            if (profileDropdown.classList.contains('show')) {
                profileDropdown.classList.remove('show');
            }
        }
    });

    /* Toggle password visibility */
    togglePwd.addEventListener('click', function () {
        var isPwd = loginPassword.type === 'password';
        loginPassword.type = isPwd ? 'text' : 'password';
        document.getElementById('eye-icon').style.opacity = isPwd ? '0.4' : '1';
    });

    /* Profile button → dropdown */
    btnProfile.addEventListener('click', function (e) {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
    });

    /* Click outside → close dropdown */
    document.addEventListener('click', function (e) {
        if (!profileDropdown.contains(e.target) && e.target !== btnProfile) {
            profileDropdown.classList.remove('show');
        }
    });

    /* Logout */
    btnLogout.addEventListener('click', function () {
        doLogout();
        showToast('👋 Logged out successfully');
    });


   
/* ══════════════════════════════════════════════════
   MEDIATOR TAB — UPDATED WITH LOCATION
══════════════════════════════════════════════════ */
 
var mediatorRecords = {};
 
var knownMediators = [
    { name: "Anbu",      phone: "9876543210", location: "Chennai" },
    { name: "Babu",      phone: "9876543211", location: "Coimbatore" },
    { name: "Chandru",   phone: "9876543212", location: "Madurai" },
    { name: "Dinesh",    phone: "9876543213", location: "Salem" },
    { name: "Ezhil",     phone: "9876543214", location: "Trichy" },
    { name: "Ganesh",    phone: "9876543215", location: "Erode" },
    { name: "Ilayaraja", phone: "9876543216", location: "Tirunelveli" }
];
 
function buildMedDatalist() {
    var dl = document.getElementById("med-name-list");
    if (!dl) return;
    dl.innerHTML = "";
    knownMediators.forEach(function (m) {
        var opt = document.createElement("option");
        opt.value = m.name;
        dl.appendChild(opt);
    });
}
 
/* Auto-fill phone + location when known mediator typed */
document.getElementById("medName").addEventListener("input", function () {
    var val = this.value.trim().toLowerCase();
    var found = knownMediators.find(function (m) {
        return m.name.toLowerCase() === val;
    });
    if (found) {
        document.getElementById("medPhone").value    = found.phone;
        document.getElementById("medLocation").value = found.location || '';
    }
});
 
/* Add mediator row */
document.getElementById("btnAddMedRow").addEventListener("click", function () {
    var name     = document.getElementById("medName").value.trim();
    var phone    = document.getElementById("medPhone").value.trim();
    var location = document.getElementById("medLocation").value.trim();
 
    if (!name) {
        document.getElementById("medName").focus();
        showToast("⚠️ Please enter a mediator name");
        return;
    }
 
    if (phone && phone.length !== 10) {
        document.getElementById("medPhone").focus();
        showToast("⚠️ Phone must be 10 digits");
        return;
    }
 
    if (!mediatorRecords[currentPlotId]) {
        mediatorRecords[currentPlotId] = [];
    }
    mediatorRecords[currentPlotId].push({
        name:     name,
        phone:    phone,
        location: location
    });
 
    renderMedTable();
    syncMedToCustomerDropdown();
 
    document.getElementById("medName").value     = "";
    document.getElementById("medPhone").value    = "";
    document.getElementById("medLocation").value = "";
    document.getElementById("medName").focus();
 
    showToast("✅ Mediator added: " + name);
});
 
syncMedToCustomerDropdown();
 
/* Render mediator table */
function renderMedTable() {
    var tbody   = document.getElementById("medTableBody");
    var records = mediatorRecords[currentPlotId] || [];
    var summary = document.getElementById("medSummary");
 
    tbody.innerHTML = "";
 
    if (records.length === 0) {
        tbody.innerHTML =
            '<tr class="med-empty-row" id="medEmptyRow">' +
            '<td colspan="5">' +
            '<div class="med-table-empty">' +
            '<span>🤝</span>' +
            '<p>No mediator entries yet. Add one above.</p>' +
            '</div></td></tr>';
        summary.style.display = "none";
        return;
    }
 
    records.forEach(function (rec, idx) {
        var initial = rec.name.charAt(0).toUpperCase();
        var tr = document.createElement("tr");
        tr.innerHTML =
            '<td>' + (idx + 1) + '</td>' +
            '<td>' +
              '<div class="td-name">' +
                '<div class="td-avatar">' + initial + '</div>' +
                '<span>' + escHtml(rec.name) + '</span>' +
              '</div>' +
            '</td>' +
            '<td>' + (rec.phone ? escHtml(rec.phone) : '<span style="color:#bbb;">—</span>') + '</td>' +
            '<td>' + (rec.location ? escHtml(rec.location) : '<span style="color:#bbb;">—</span>') + '</td>' +
            '<td>' +
              '<button class="med-del-btn" data-idx="' + idx + '" title="Remove">✕</button>' +
            '</td>';
 
        tr.querySelector(".med-del-btn").addEventListener("click", function () {
            var i = parseInt(this.getAttribute("data-idx"));
            mediatorRecords[currentPlotId].splice(i, 1);
            renderMedTable();
            syncMedToCustomerDropdown();
            showToast("🗑 Mediator removed");
        });
 
        tbody.appendChild(tr);
    });
 
    document.getElementById("medSumCount").textContent = records.length;
    summary.style.display = "grid";
}
 
/* Sync mediator names to Customer dropdown */
function syncMedToCustomerDropdown() {
    var sel     = document.getElementById("mediatorSel");
    var records = mediatorRecords[currentPlotId] || [];
    var prev    = sel.value;
 
    sel.innerHTML = '<option value="">— Select Mediator —</option>';
 
    records.forEach(function (rec) {
        var opt = document.createElement("option");
        opt.value       = rec.name;
        opt.textContent = rec.name + (rec.phone ? " (" + rec.phone + ")" : "");
        opt.setAttribute("data-phone",    rec.phone    || "");
        opt.setAttribute("data-location", rec.location || "");
        sel.appendChild(opt);
    });
 
    knownMediators.forEach(function (m) {
        var already = records.some(function (r) {
            return r.name.toLowerCase() === m.name.toLowerCase();
        });
        if (!already) {
            var opt = document.createElement("option");
            opt.value       = m.name;
            opt.textContent = m.name;
            opt.setAttribute("data-phone",    m.phone    || "");
            opt.setAttribute("data-location", m.location || "");
            sel.appendChild(opt);
        }
    });
 
    var otherOpt = document.createElement("option");
    otherOpt.value       = "other";
    otherOpt.textContent = "Other (type below)…";
    sel.appendChild(otherOpt);
 
    if (prev) sel.value = prev;
}
 
/* mediatorSel change handler */
document.getElementById("mediatorSel").addEventListener("change", function () {
    var show = this.value === "other";
    document.getElementById("mediatorOther").style.display = show ? "block" : "none";
    if (show) {
        document.getElementById("mediatorOther").focus();
        return;
    }
});
 
/* Save mediator */
document.getElementById("btnSaveMed").addEventListener("click", function () {
    var records = mediatorRecords[currentPlotId] || [];
    if (records.length === 0) {
        showToast("⚠️ No mediator entries to save");
        return;
    }
    showToast("✅ Mediator details saved — " + records.length + " mediator(s)");
    closePopup();
});
 
/* Reset mediator tab */
function resetMedTab() {
    document.getElementById("medName").value     = "";
    document.getElementById("medPhone").value    = "";
    document.getElementById("medLocation").value = "";
    renderMedTable();
}
 
function escHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
 
buildMedDatalist();
 /* ══════════════════════════════════════════════════
   PHONE NUMBER — MAX 10 DIGITS ENFORCEMENT
══════════════════════════════════════════════════ */
function enforcePhone(inputEl) {
    inputEl.addEventListener('input', function () {
        // Remove non-digits
        this.value = this.value.replace(/\D/g, '');
        // Trim to 10
        if (this.value.length > 10) {
            this.value = this.value.slice(0, 10);
        }
    });
    inputEl.addEventListener('keypress', function (e) {
        if (!/[0-9]/.test(e.key)) e.preventDefault();
        if (this.value.length >= 10) e.preventDefault();
    });
}
 
/* Apply to all phone fields */
enforcePhone(document.getElementById('custPhone'));
enforcePhone(document.getElementById('medPhone'));
 
 
/* ── Initialize datalist ── */
buildMedDatalist();
 
 

})();