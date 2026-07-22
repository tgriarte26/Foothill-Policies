(function(){
'use strict';
var SK='fhda_st',TK='fhda_th',DK='fhda_du',TLK='fhda_tl',HK='fhda_hist';
var SL={'needs-review':'Needs Review','in-progress':'In Progress','approved':'Approved','completed':'Completed','archived':'Archived'};
var STAGES=['Chancellor\'s 1st Read','Chancellor\'s 2nd Read','Board of Trustees 1st Read','Board of Trustees 2nd Read'];
var docs=[],so={},dd={},tl={},history=[],filter='all',chapter='all',sort='number-asc',query='';
var currentTlDoc=null;

var tbody=document.getElementById('documents-tbody');
var empty=document.getElementById('empty-state');
var tableSection=document.getElementById('table-section');
var searchIn=document.getElementById('search-input');
var sortSel=document.getElementById('sort-select');
var chapterNav=document.getElementById('chapter-nav');
var filterNav=document.getElementById('filter-nav');
var themeBtn=document.getElementById('theme-toggle');
var menuBtn=document.getElementById('menu-btn');
var sidebar=document.getElementById('sidebar');
var dOverlay=document.getElementById('detail-modal-overlay');
var dTitle=document.getElementById('detail-modal-title');
var dBody=document.getElementById('detail-modal-body');
var dClose=document.getElementById('detail-modal-close');
var tlOverlay=document.getElementById('timeline-overlay');
var tlTitle=document.getElementById('timeline-title');
var tlSub=document.getElementById('timeline-sub');
var tlProgress=document.getElementById('timeline-progress');
var tlStatus=document.getElementById('timeline-status');
var tlClose=document.getElementById('timeline-close');
var histToggle=document.getElementById('history-toggle');
var histOverlay=document.getElementById('history-overlay');
var histClose=document.getElementById('history-close');
var histList=document.getElementById('history-list');
var sTotal=document.getElementById('stat-total');
var sReview=document.getElementById('stat-review');
var sProg=document.getElementById('stat-progress');
var sDone=document.getElementById('stat-completed');
var cAll=document.getElementById('count-all');
var cRev=document.getElementById('count-needs-review');
var cProg=document.getElementById('count-in-progress');
var cApp=document.getElementById('count-approved');
var cDone=document.getElementById('count-completed');
var cArch=document.getElementById('count-archived');

function initTheme(){var t=localStorage.getItem(TK);if(t)document.documentElement.setAttribute('data-theme',t);}
function toggleTheme(){var c=document.documentElement.getAttribute('data-theme');var n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem(TK,n);}

function load(){
    try{so=JSON.parse(localStorage.getItem(SK))||{};}catch(e){so={};}
    try{dd=JSON.parse(localStorage.getItem(DK))||{};}catch(e){dd={};}
    try{tl=JSON.parse(localStorage.getItem(TLK))||{};}catch(e){tl={};}
    try{history=JSON.parse(localStorage.getItem(HK))||[];}catch(e){history=[];}    docs=POLICIES_DATA.map(function(p,i){
        return{id:i,number:p.number,title:p.title,chapter:p.chapter,
            type:p.type||(p.number.indexOf('AP')===0?'Administrative Procedure':'Board Policy'),
            status:so[p.number]||'needs-review',adopted:p.adopted||'',lastRevised:p.lastRevised||'',
            dueDate:dd[p.number]||''};
    });
}

function fmtD(s){
    if(!s||s==='11/30/-0001')return'\u2014';
    var p=s.split('/');if(p.length!==3)return s;
    var m=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var mi=parseInt(p[0],10)-1;if(mi<0||mi>11)return s;
    return m[mi]+' '+parseInt(p[1],10)+', '+p[2];
}
function esc(t){var d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function exN(s){var m=s.match(/[\d.]+/);return m?parseFloat(m[0]):0;}

function getF(){
    var f=docs.slice();
    if(chapter!=='all')f=f.filter(function(d){return d.chapter===chapter;});
    if(filter!=='all')f=f.filter(function(d){return d.status===filter;});
    if(query.trim()){var q=query.toLowerCase();f=f.filter(function(d){return d.number.toLowerCase().indexOf(q)!==-1||d.title.toLowerCase().indexOf(q)!==-1;});}
    f.sort(function(a,b){
        switch(sort){
            case'number-asc':return exN(a.number)-exN(b.number);
            case'number-desc':return exN(b.number)-exN(a.number);
            case'title-asc':return a.title.localeCompare(b.title);
            case'title-desc':return b.title.localeCompare(a.title);
            case'revised-desc':return(b.lastRevised||'0').localeCompare(a.lastRevised||'0');
            case'revised-asc':return(a.lastRevised||'0').localeCompare(b.lastRevised||'0');
            case'status':var o=['needs-review','in-progress','approved','completed','archived'];return o.indexOf(a.status)-o.indexOf(b.status);
            default:return 0;
        }
    });
    return f;
}

function render(){
    sTotal.textContent=docs.length;
    sReview.textContent=docs.filter(function(d){return d.status==='needs-review';}).length;
    sProg.textContent=docs.filter(function(d){return d.status==='in-progress';}).length;
    sDone.textContent=docs.filter(function(d){return d.status==='completed';}).length;
    cAll.textContent=docs.length;
    cRev.textContent=docs.filter(function(d){return d.status==='needs-review';}).length;
    cProg.textContent=docs.filter(function(d){return d.status==='in-progress';}).length;
    cApp.textContent=docs.filter(function(d){return d.status==='approved';}).length;
    cDone.textContent=docs.filter(function(d){return d.status==='completed';}).length;
    cArch.textContent=docs.filter(function(d){return d.status==='archived';}).length;

    var f=getF();
    if(!f.length){tbody.innerHTML='';empty.style.display='block';tableSection.style.display='none';return;}
    empty.style.display='none';tableSection.style.display='block';

    // Show timeline column only when filtering to in-progress
    var showTl=(filter==='in-progress');
    var thead=document.getElementById('table-head');
    if(showTl){
        thead.innerHTML='<tr><th>Policy Name</th><th>Number</th><th>Type</th><th>Status</th><th>Timeline</th><th>Updated</th><th>Due Date</th></tr>';
    }else{
        thead.innerHTML='<tr><th>Policy Name</th><th>Number</th><th>Type</th><th>Status</th><th>Updated</th><th>Due Date</th></tr>';
    }

    var h='';
    for(var i=0;i<f.length;i++){
        var d=f[i];
        var tc=d.type==='Board Policy'?'type-bp':'type-ap';
        var tl2=d.type==='Board Policy'?'BP':'AP';
        var upd=d.lastRevised?fmtD(d.lastRevised):fmtD(d.adopted);
        var tlBtn='';
        if(showTl&&d.status==='in-progress'){
            var stg=tl[d.number]||[false,false,false,false];
            var allDone=stg[0]&&stg[1]&&stg[2]&&stg[3];
            tlBtn='<button class="tl-btn'+(allDone?' tl-btn-done':'')+'" data-action="timeline" data-id="'+d.id+'" title="View approval timeline">'+(allDone?'&#10003;':'&#9201;')+'</button>';
        }
        h+='<tr><td><span class="cell-title" data-action="detail" data-id="'+d.id+'">'+esc(d.title)+'</span></td>'+
            '<td><span class="cell-num">'+esc(d.number)+'</span></td>'+
            '<td><span class="cell-type '+tc+'">'+tl2+'</span></td>'+
            '<td><select class="status-sel '+d.status+'" data-id="'+d.id+'">'+
            '<option value="needs-review"'+(d.status==='needs-review'?' selected':'')+'>Review</option>'+
            '<option value="in-progress"'+(d.status==='in-progress'?' selected':'')+'>In Progress</option>'+
            '<option value="approved"'+(d.status==='approved'?' selected':'')+'>Approved</option>'+
            '<option value="completed"'+(d.status==='completed'?' selected':'')+'>Done</option>'+
            '<option value="archived"'+(d.status==='archived'?' selected':'')+'>Archived</option>'+
            '</select></td>'+
            (showTl?'<td>'+tlBtn+'</td>':'')+
            '<td><span class="cell-date">'+upd+'</span></td>'+
            '<td><input type="date" class="due-input" data-id="'+d.id+'" value="'+(d.dueDate||'')+'"></td></tr>';
    }
    tbody.innerHTML=h;
}

function openD(id){
    var d=docs[id];if(!d)return;
    dTitle.textContent=d.number+' \u2014 '+d.title;
    dBody.innerHTML='<div class="detail-grid">'+
        '<div class="detail-row"><strong>Name</strong><span>'+esc(d.title)+'</span></div>'+
        '<div class="detail-row"><strong>Number</strong><span>'+esc(d.number)+'</span></div>'+
        '<div class="detail-row"><strong>Type</strong><span>'+esc(d.type)+'</span></div>'+
        '<div class="detail-row"><strong>Chapter</strong><span>'+esc(d.chapter)+'</span></div>'+
        '<div class="detail-row"><strong>Status</strong><span><span class="status-badge '+d.status+'">'+SL[d.status]+'</span></span></div>'+
        '<div class="detail-row"><strong>Adopted</strong><span>'+fmtD(d.adopted)+'</span></div>'+
        '<div class="detail-row"><strong>Revised</strong><span>'+fmtD(d.lastRevised)+'</span></div>'+
        '</div>';
    dOverlay.classList.add('active');
}

// --- Timeline ---
function getStages(policyNum){
    return tl[policyNum]||[false,false,false,false];
}
function saveTimeline(){
    try{localStorage.setItem(TLK,JSON.stringify(tl));}catch(x){}
}
function openTimeline(id){
    var d=docs[id];if(!d)return;
    currentTlDoc=d;
    tlTitle.textContent='Approval Timeline';
    tlSub.textContent=d.number+' \u2014 '+d.title;
    renderTimeline();
    tlOverlay.classList.add('active');
}
function renderTimeline(){
    if(!currentTlDoc)return;
    var stages=getStages(currentTlDoc.number);
    var completed=0;
    for(var i=0;i<4;i++){
        var el=document.getElementById('tl-stage-'+i);
        var node=el.parentElement;
        if(stages[i]){
            node.classList.add('done');
            node.classList.remove('active');
            el.innerHTML='&#10003;';
            completed++;
        }else{
            node.classList.remove('done');
            if(i===0||(i>0&&stages[i-1])){
                node.classList.add('active');
                el.innerHTML='';
            }else{
                node.classList.remove('active');
                el.innerHTML='';
            }
        }
    }
    var pct=completed===0?0:(completed/4)*100;
    tlProgress.style.width=pct+'%';
    if(completed===4){
        tlStatus.innerHTML='<span class="tl-complete">&#10003; All stages complete — ready for final approval</span>';
    }else{
        tlStatus.innerHTML='<span class="tl-pending">Stage '+(completed+1)+' of 4 — '+STAGES[completed]+'</span>';
    }
}
function handleTimelineClick(stageIdx){
    if(!currentTlDoc)return;
    var stages=getStages(currentTlDoc.number);
    // Toggle: if clicking the current active stage, mark it done
    // If clicking a completed stage, unmark it and all after
    if(stages[stageIdx]){
        // Unmark this and all after
        for(var i=stageIdx;i<4;i++)stages[i]=false;
    }else{
        // Mark this and all before as done
        for(var i=0;i<=stageIdx;i++)stages[i]=true;
    }
    tl[currentTlDoc.number]=stages;
    saveTimeline();
    renderTimeline();
    render();
}

// --- History ---
function openHistory(){
    renderHistory();
    histOverlay.classList.add('active');
}
function renderHistory(){
    if(!history.length){
        histList.innerHTML='<p class="history-empty">No review history yet. Change a policy status to start tracking.</p>';
        return;
    }
    var h='';
    for(var i=0;i<Math.min(history.length,50);i++){
        var e=history[i];
        var d=new Date(e.date);
        var dateStr=d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
        var timeStr=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
        h+='<div class="history-item">'+
            '<div class="history-item-left">'+
            '<span class="history-num">'+esc(e.number)+'</span>'+
            '<span class="history-title">'+esc(e.title)+'</span>'+
            '</div>'+
            '<div class="history-item-right">'+
            '<span class="status-badge '+e.from+'">'+SL[e.from]+'</span>'+
            '<span class="history-arrow">&rarr;</span>'+
            '<span class="status-badge '+e.to+'">'+SL[e.to]+'</span>'+
            '<span class="history-date">'+dateStr+' '+timeStr+'</span>'+
            '</div>'+
            '</div>';
    }
    histList.innerHTML=h;
}

function init(){
    initTheme();load();render();
    themeBtn.addEventListener('click',toggleTheme);
    menuBtn.addEventListener('click',function(){sidebar.classList.toggle('open');});
    searchIn.addEventListener('input',function(){query=searchIn.value;render();});
    sortSel.addEventListener('change',function(){sort=sortSel.value;render();});

    // Chapter sidebar nav
    chapterNav.addEventListener('click',function(e){
        var btn=e.target.closest('.nav-btn');if(!btn)return;
        document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        chapter=btn.dataset.chapter;
        render();
        // close mobile sidebar
        sidebar.classList.remove('open');
    });

    // Status filter tabs
    filterNav.addEventListener('click',function(e){
        var t=e.target.closest('.tab');if(!t)return;
        document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
        t.classList.add('active');filter=t.dataset.filter;render();
    });

    // Table interactions
    tbody.addEventListener('click',function(e){
        var el=e.target.closest('[data-action="detail"]');
        if(el){e.preventDefault();openD(parseInt(el.dataset.id,10));return;}
        var tlEl=e.target.closest('[data-action="timeline"]');
        if(tlEl){e.preventDefault();openTimeline(parseInt(tlEl.dataset.id,10));}
    });
    tbody.addEventListener('change',function(e){
        if(e.target.classList.contains('status-sel')){
            var id=parseInt(e.target.dataset.id,10),d=docs[id];
            var oldStatus=d.status;
            d.status=e.target.value;so[d.number]=e.target.value;
            try{localStorage.setItem(SK,JSON.stringify(so));}catch(x){}
            // Log to history
            history.unshift({number:d.number,title:d.title,from:oldStatus,to:e.target.value,date:new Date().toISOString()});
            if(history.length>200)history=history.slice(0,200);
            try{localStorage.setItem(HK,JSON.stringify(history));}catch(x){}
            render();
        }
        if(e.target.classList.contains('due-input')){
            var id2=parseInt(e.target.dataset.id,10),d2=docs[id2];
            d2.dueDate=e.target.value;dd[d2.number]=e.target.value;
            try{localStorage.setItem(DK,JSON.stringify(dd));}catch(x){}
        }
    });

    // Detail modal
    dClose.addEventListener('click',function(){dOverlay.classList.remove('active');});
    dOverlay.addEventListener('click',function(e){if(e.target===dOverlay)dOverlay.classList.remove('active');});

    // Timeline modal
    tlClose.addEventListener('click',function(){tlOverlay.classList.remove('active');currentTlDoc=null;});
    tlOverlay.addEventListener('click',function(e){if(e.target===tlOverlay){tlOverlay.classList.remove('active');currentTlDoc=null;}});
    // Stage clicks
    for(var s=0;s<4;s++){
        (function(idx){
            document.getElementById('tl-stage-'+idx).addEventListener('click',function(){handleTimelineClick(idx);});
        })(s);
    }

    document.addEventListener('keydown',function(e){if(e.key==='Escape'){dOverlay.classList.remove('active');tlOverlay.classList.remove('active');histOverlay.classList.remove('active');currentTlDoc=null;}});

    // History
    histToggle.addEventListener('click',openHistory);
    histClose.addEventListener('click',function(){histOverlay.classList.remove('active');});
    histOverlay.addEventListener('click',function(e){if(e.target===histOverlay)histOverlay.classList.remove('active');});
}
init();
})();
