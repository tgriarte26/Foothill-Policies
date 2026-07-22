(function(){
'use strict';
var SK='fhda_st',TK='fhda_th',DK='fhda_du',TLK='fhda_tl',CK='fhda_cat',STGK='fhda_stages';
var SL={'needs-review':'Needs Review','in-progress':'In Progress','approved':'Approved','completed':'Completed','archived':'Archived'};
var DEFAULT_STAGES=['Chancellor\'s 1st Read','Chancellor\'s 2nd Read','Board of Trustees 1st Read','Board of Trustees 2nd Read'];
var docs=[],so={},dd={},tl={},cat={},stages=[],filter='all',chapter='all',sort='number-asc',query='';
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
var tlNodes=document.getElementById('timeline-nodes');
var tlAddBtn=document.getElementById('tl-add-stage');
var sTotal=document.getElementById('stat-total');
var sReview=document.getElementById('stat-review');
var sProg=document.getElementById('stat-progress');
var sDone=document.getElementById('stat-completed');
var cAll=document.getElementById('count-all');
var cReq=document.getElementById('count-legally-required');
var cRec=document.getElementById('count-legally-recommended');
var cOpt=document.getElementById('count-optional');

function initTheme(){var t=localStorage.getItem(TK);if(t)document.documentElement.setAttribute('data-theme',t);}
function toggleTheme(){var c=document.documentElement.getAttribute('data-theme');var n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem(TK,n);}

function loadStages(){
    try{var s=JSON.parse(localStorage.getItem(STGK));if(s&&s.length)return s;}catch(e){}
    return DEFAULT_STAGES.slice();
}
function saveStages(){
    try{localStorage.setItem(STGK,JSON.stringify(stages));}catch(x){}
}

function load(){
    try{so=JSON.parse(localStorage.getItem(SK))||{};}catch(e){so={};}
    try{dd=JSON.parse(localStorage.getItem(DK))||{};}catch(e){dd={};}
    try{tl=JSON.parse(localStorage.getItem(TLK))||{};}catch(e){tl={};}
    try{cat=JSON.parse(localStorage.getItem(CK))||{};}catch(e){cat={};}
    stages=loadStages();
    docs=POLICIES_DATA.map(function(p,i){
        return{id:i,number:p.number,title:p.title,chapter:p.chapter,
            type:p.type||(p.number.indexOf('AP')===0?'Administrative Procedure':'Board Policy'),
            status:so[p.number]||'needs-review',adopted:p.adopted||'',lastRevised:p.lastRevised||'',
            dueDate:dd[p.number]||'',
            category:cat[p.number]||'optional'};
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
    if(filter!=='all')f=f.filter(function(d){return d.category===filter;});
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
    cReq.textContent=docs.filter(function(d){return d.category==='legally-required';}).length;
    cRec.textContent=docs.filter(function(d){return d.category==='legally-recommended';}).length;
    cOpt.textContent=docs.filter(function(d){return d.category==='optional';}).length;

    var f=getF();
    if(!f.length){tbody.innerHTML='';empty.style.display='block';tableSection.style.display='none';return;}
    empty.style.display='none';tableSection.style.display='block';

    var h='';
    for(var i=0;i<f.length;i++){
        var d=f[i];
        var tc=d.type==='Board Policy'?'type-bp':'type-ap';
        var tl2=d.type==='Board Policy'?'BP':'AP';
        var upd=d.lastRevised?fmtD(d.lastRevised):fmtD(d.adopted);
        var tlBtn='<button class="tl-btn" data-action="timeline" data-id="'+d.id+'" title="View approval timeline">&#9201;</button>';
        var catClass='cat-'+d.category;
        h+='<tr class="policy-row" data-id="'+d.id+'">'+
            '<td><span class="cell-expand" data-action="expand" data-id="'+d.id+'" title="Expand policy details">&#9654;</span> <span class="cell-title" data-action="detail" data-id="'+d.id+'">'+esc(d.title)+'</span></td>'+
            '<td><span class="cell-num">'+esc(d.number)+'</span></td>'+
            '<td><span class="cell-type '+tc+'">'+tl2+'</span></td>'+
            '<td><select class="cat-sel '+catClass+'" data-id="'+d.id+'">'+
            '<option value="legally-required"'+(d.category==='legally-required'?' selected':'')+'>Legally Required</option>'+
            '<option value="legally-recommended"'+(d.category==='legally-recommended'?' selected':'')+'>Legally Recommended</option>'+
            '<option value="optional"'+(d.category==='optional'?' selected':'')+'>Optional</option>'+
            '</select></td>'+
            '<td>'+tlBtn+'</td>'+
            '<td><span class="cell-date">'+upd+'</span></td>'+
            '<td><input type="date" class="due-input" data-id="'+d.id+'" value="'+(d.dueDate||'')+'"></td></tr>';
        // Expandable dropdown row
        h+='<tr class="expand-row" id="expand-row-'+d.id+'" style="display:none;">'+
            '<td colspan="7">'+
            '<div class="expand-content">'+
            '<div class="expand-section">'+
            '<h4 class="expand-section-title">Marked Down</h4>'+
            '<div class="expand-section-body placeholder-text">No marked-down content available yet. This section will contain annotated or redlined policy text.</div>'+
            '</div>'+
            '<div class="expand-section">'+
            '<h4 class="expand-section-title">Current Policy</h4>'+
            '<div class="expand-section-body placeholder-text">No current policy content available yet. This section will contain the active policy text.</div>'+
            '</div>'+
            '</div>'+
            '</td></tr>';
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
        '<div class="detail-row"><strong>Category</strong><span>'+esc(d.category.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}))+'</span></div>'+
        '<div class="detail-row"><strong>Adopted</strong><span>'+fmtD(d.adopted)+'</span></div>'+
        '<div class="detail-row"><strong>Revised</strong><span>'+fmtD(d.lastRevised)+'</span></div>'+
        '</div>';
    dOverlay.classList.add('active');
}

// --- Expand/Collapse ---
function toggleExpand(id){
    var row=document.getElementById('expand-row-'+id);
    var arrow=document.querySelector('.cell-expand[data-id="'+id+'"]');
    if(!row)return;
    if(row.style.display==='none'){
        row.style.display='table-row';
        if(arrow)arrow.innerHTML='&#9660;';
    }else{
        row.style.display='none';
        if(arrow)arrow.innerHTML='&#9654;';
    }
}

// --- Timeline ---
function getStages(policyNum){
    var s=tl[policyNum];
    if(!s)return newStageArray();
    // Ensure array length matches current stages count
    while(s.length<stages.length)s.push(false);
    if(s.length>stages.length)s=s.slice(0,stages.length);
    return s;
}
function newStageArray(){
    var arr=[];
    for(var i=0;i<stages.length;i++)arr.push(false);
    return arr;
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
    var stageStates=getStages(currentTlDoc.number);
    var numStages=stages.length;

    // Build nodes dynamically
    var nodesHtml='';
    for(var i=0;i<numStages;i++){
        nodesHtml+='<div class="tl-node'+(stageStates[i]?' done':((i===0||(i>0&&stageStates[i-1]))?' active':''))+'" data-stage="'+i+'">'+
            '<button class="tl-circle" data-stage-idx="'+i+'" aria-label="Mark stage complete">'+(stageStates[i]?'&#10003;':'')+'</button>'+
            '<input type="text" class="tl-label-input" data-stage-idx="'+i+'" value="'+esc(stages[i])+'" title="Click to edit label">'+
            '<button class="tl-remove-btn" data-stage-idx="'+i+'" title="Remove stage">&times;</button>'+
            '</div>';
    }
    tlNodes.innerHTML=nodesHtml;

    var completed=0;
    for(var j=0;j<numStages;j++){if(stageStates[j])completed++;}
    var pct=numStages===0?0:(completed/numStages)*100;
    tlProgress.style.width=pct+'%';

    if(completed===numStages&&numStages>0){
        tlStatus.innerHTML='<span class="tl-complete">&#10003; All stages complete — ready for final approval</span>';
    }else if(numStages>0){
        tlStatus.innerHTML='<span class="tl-pending">Stage '+(completed+1)+' of '+numStages+' — '+stages[completed]+'</span>';
    }else{
        tlStatus.innerHTML='<span class="tl-pending">No stages defined</span>';
    }
}
function handleTimelineClick(stageIdx){
    if(!currentTlDoc)return;
    var stageStates=getStages(currentTlDoc.number);
    if(stageStates[stageIdx]){
        for(var i=stageIdx;i<stages.length;i++)stageStates[i]=false;
    }else{
        for(var i=0;i<=stageIdx;i++)stageStates[i]=true;
    }
    tl[currentTlDoc.number]=stageStates;
    saveTimeline();
    renderTimeline();
    render();
}
function addStage(){
    var name=prompt('Enter label for the new stage:');
    if(!name||!name.trim())return;
    stages.push(name.trim());
    saveStages();
    // Extend all existing timeline data
    for(var key in tl){
        if(tl.hasOwnProperty(key)){
            tl[key].push(false);
        }
    }
    saveTimeline();
    renderTimeline();
}
function removeStage(idx){
    if(stages.length<=1){alert('Must have at least one stage.');return;}
    if(!confirm('Remove stage "'+stages[idx]+'"?'))return;
    stages.splice(idx,1);
    saveStages();
    // Remove from all timeline data
    for(var key in tl){
        if(tl.hasOwnProperty(key)&&tl[key].length>idx){
            tl[key].splice(idx,1);
        }
    }
    saveTimeline();
    renderTimeline();
}
function renameStage(idx,newName){
    if(!newName||!newName.trim())return;
    stages[idx]=newName.trim();
    saveStages();
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
        sidebar.classList.remove('open');
    });

    // Category filter tabs
    filterNav.addEventListener('click',function(e){
        var t=e.target.closest('.tab');if(!t)return;
        document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
        t.classList.add('active');filter=t.dataset.filter;render();
    });

    // Table interactions
    tbody.addEventListener('click',function(e){
        var expandEl=e.target.closest('[data-action="expand"]');
        if(expandEl){e.preventDefault();toggleExpand(parseInt(expandEl.dataset.id,10));return;}
        var el=e.target.closest('[data-action="detail"]');
        if(el){e.preventDefault();openD(parseInt(el.dataset.id,10));return;}
        var tlEl=e.target.closest('[data-action="timeline"]');
        if(tlEl){e.preventDefault();openTimeline(parseInt(tlEl.dataset.id,10));}
    });
    tbody.addEventListener('change',function(e){
        if(e.target.classList.contains('cat-sel')){
            var id=parseInt(e.target.dataset.id,10),d=docs[id];
            d.category=e.target.value;cat[d.number]=e.target.value;
            try{localStorage.setItem(CK,JSON.stringify(cat));}catch(x){}render();
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

    // Timeline node interactions (delegated)
    tlNodes.addEventListener('click',function(e){
        var circle=e.target.closest('.tl-circle');
        if(circle){
            var idx=parseInt(circle.dataset.stageIdx,10);
            handleTimelineClick(idx);
            return;
        }
        var removeBtn=e.target.closest('.tl-remove-btn');
        if(removeBtn){
            var ridx=parseInt(removeBtn.dataset.stageIdx,10);
            removeStage(ridx);
            return;
        }
    });
    tlNodes.addEventListener('change',function(e){
        if(e.target.classList.contains('tl-label-input')){
            var idx=parseInt(e.target.dataset.stageIdx,10);
            renameStage(idx,e.target.value);
        }
    });

    // Add stage button
    tlAddBtn.addEventListener('click',addStage);

    document.addEventListener('keydown',function(e){if(e.key==='Escape'){dOverlay.classList.remove('active');tlOverlay.classList.remove('active');currentTlDoc=null;}});
}
init();
})();
