(function(){
'use strict';
var SK='fhda_st',TK='fhda_th',DK='fhda_du',TLK='fhda_tl',CK='fhda_cat',STGK='fhda_stages',SDK='fhda_stage_dates';
var SL={'needs-review':'Needs Review','in-progress':'In Progress','approved':'Approved','completed':'Completed','archived':'Archived'};
var DEFAULT_STAGES=['Chancellor\'s Advisory Committee 1st Read','Chancellor\'s Advisory Committee 2nd Read','Board of Trustees 1st Read','Board of Trustees 2nd Read'];
var docs=[],so={},dd={},tl={},cat={},stages=[],stageDates={},filter='all',chapter='all',sort='number-asc',query='';
var currentTlDoc=null;
var pendingRemoveIdx=null;

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
var deleteModal=document.getElementById('delete-confirm-overlay');
var deleteYes=document.getElementById('delete-confirm-yes');
var deleteNo=document.getElementById('delete-confirm-no');
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
function saveStageDates(){
    try{localStorage.setItem(SDK,JSON.stringify(stageDates));}catch(x){}
}

function load(){
    try{so=JSON.parse(localStorage.getItem(SK))||{};}catch(e){so={};}
    try{dd=JSON.parse(localStorage.getItem(DK))||{};}catch(e){dd={};}
    try{tl=JSON.parse(localStorage.getItem(TLK))||{};}catch(e){tl={};}
    try{cat=JSON.parse(localStorage.getItem(CK))||{};}catch(e){cat={};}
    try{stageDates=JSON.parse(localStorage.getItem(SDK))||{};}catch(e){stageDates={};}
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

// Check if all timeline stages are complete for a policy
function isTimelineComplete(policyNum){
    var s=tl[policyNum];
    if(!s||!stages.length)return false;
    for(var i=0;i<stages.length;i++){
        if(!s[i])return false;
    }
    return true;
}

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
        var allDone=isTimelineComplete(d.number);
        var tlBtn='<button class="tl-btn'+(allDone?' tl-btn-done':'')+'" data-action="timeline" data-id="'+d.id+'" title="View approval timeline">'+(allDone?'&#10003;':'&#9201;')+'</button>';
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
        h+='<tr class="expand-row" id="expand-row-'+d.id+'" style="display:none;">'+
            '<td colspan="7">'+
            '<div class="expand-content">'+
            '<div class="expand-section">'+
            '<h4 class="expand-section-title">Current Policy Text</h4>'+
            '<div class="expand-section-body" id="policy-text-'+d.id+'" data-policy-num="'+esc(d.number)+'" data-loaded="false">'+
            '<span class="placeholder-text">Loading...</span>'+
            '</div>'+
            '</div>'+
            '<div class="expand-section">'+
            '<h4 class="expand-section-title">Markup &amp; Download</h4>'+
            '<div class="expand-section-body markup-section">'+
            '<textarea class="markup-editor" id="markup-editor-'+d.id+'" placeholder="Edit/annotate this policy text here..."></textarea>'+
            '<button class="markup-download-btn" data-id="'+d.id+'" data-num="'+esc(d.number)+'" data-title="'+esc(d.title)+'">Download as PDF</button>'+
            '</div>'+
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
        // Auto-load content on first expand
        var container=document.getElementById('policy-text-'+id);
        if(container&&container.dataset.loaded==='false'){
            container.dataset.loaded='true';
            var policyNum=container.dataset.policyNum;
            loadPolicyText(id,policyNum,container);
        }
    }else{
        row.style.display='none';
        if(arrow)arrow.innerHTML='&#9654;';
    }
}

function loadPolicyText(docId,policyNum,container){
    var urls=getS3Urls(policyNum);
    // Try S3 first, then fallback to POLICY_CONTENT
    function tryNext(i){
        if(i>=urls.length){
            // All S3 URLs failed — use local POLICY_CONTENT
            container.innerHTML=getPolicyContent(policyNum);
            populateMarkupEditor(docId,policyNum);
            return;
        }
        fetch(urls[i])
            .then(function(r){
                if(!r.ok)throw new Error('HTTP '+r.status);
                return r.text();
            })
            .then(function(text){
                // Extract only this policy's section from the file
                var policyText=extractPolicySection(text,policyNum);
                if(!policyText){
                    // S3 file didn't contain proper content for this policy
                    container.innerHTML=getPolicyContent(policyNum);
                    populateMarkupEditor(docId,policyNum);
                    return;
                }
                // Render with formatting
                var html=esc(policyText)
                    .replace(/\n  • (.*?)(?=\n|$)/g,'\n<li>$1</li>')
                    .replace(/\n  (\d+[\.\)]\s.*?)(?=\n|$)/g,'\n<li>$1</li>')
                    .replace(/\n• (.*?)(?=\n|$)/g,'\n<li>$1</li>')
                    .replace(/(<li>.*?<\/li>\n?)+/g,'<ul>$&</ul>')
                    .replace(/\n\n/g,'</p><p>')
                    .replace(/\n/g,'<br>');
                container.innerHTML='<div class="policy-text"><p>'+html+'</p></div>';
                // Populate the markup editor with raw text
                var editor=document.getElementById('markup-editor-'+docId);
                if(editor)editor.value=policyText;
            })
            .catch(function(){
                tryNext(i+1);
            });
    }
    tryNext(0);
}

function extractPolicySection(fullText,policyNum){
    var lines=fullText.split('\n');
    var startIdx=0;

    // Strip the file header (Source:, Manual:, Policy:, Title:, ─── separator)
    for(var i=0;i<Math.min(lines.length,10);i++){
        var ln=lines[i];
        if(ln.indexOf('───')!==-1||ln.indexOf('────')!==-1||ln.indexOf('---')!==-1&&ln.length>3){
            startIdx=i+1;
            break;
        }
        if(ln.match(/^(Source|Manual|Policy|Title):/)){
            startIdx=i+1;
        }
    }

    // Get content after header, skip leading blanks
    var contentLines=lines.slice(startIdx);
    while(contentLines.length&&contentLines[0].trim()==='')contentLines.shift();

    var text=contentLines.join('\n').trim();
    if(!text)return '';

    // Count how many distinct policy headers (BP XXXX or AP XXXX) are in this file
    var numClean=policyNum.replace(/[()]/g,'').replace(/\*/g,'').trim();
    var allHeaders=[];
    for(var k=0;k<contentLines.length;k++){
        var t=contentLines[k].trim();
        // A policy header: starts with BP/AP + space + digit, and is NOT a "See" reference
        if(/^(BP|AP)\s+\d/.test(t)&&t.length>5){
            var low=t.toLowerCase();
            if(low.indexOf('see ')!==0&&low.indexOf('(formerly')!==0){
                allHeaders.push(k);
            }
        }
    }

    // If 0 or 1 headers: the file IS this one policy — return everything
    if(allHeaders.length<=1){
        return text.length>50?text:'';
    }

    // Multiple headers: extract just this policy's section
    var capturing=false;
    var result=[];

    for(var j=0;j<contentLines.length;j++){
        var line=contentLines[j];
        var trimmed=line.trim();

        if(!capturing){
            // Start capturing when we find THIS policy number
            if(trimmed.indexOf(numClean)===0){
                capturing=true;
                result.push(line);
            }
        }else{
            // Stop at the next policy header
            if(/^(BP|AP)\s+\d/.test(trimmed)&&trimmed.length>5){
                var lw=trimmed.toLowerCase();
                if(lw.indexOf('see ')!==0&&lw.indexOf('(formerly')!==0&&
                   lw.indexOf('see board')!==0&&lw.indexOf('see administrative')!==0){
                    break;
                }
            }
            result.push(line);
        }
    }

    if(result.length<2)return '';

    var extracted=result.join('\n').trim();
    // Must have real substance
    if(extracted.length<50)return '';
    return extracted;
}

function populateMarkupEditor(docId,policyNum){
    // Fill the markup editor from POLICY_CONTENT
    var editor=document.getElementById('markup-editor-'+docId);
    if(!editor)return;
    for(var i=0;i<POLICY_CONTENT.length;i++){
        if(POLICY_CONTENT[i].id===policyNum){
            editor.value=POLICY_CONTENT[i].content;
            return;
        }
    }
}

// --- PDF Download ---
function downloadPolicyPDF(docId,policyNum,policyTitle){
    var editor=document.getElementById('markup-editor-'+docId);
    if(!editor||!editor.value.trim()){alert('No content to download.');return;}

    var text=editor.value;
    // Create a printable HTML document
    var htmlContent='<!DOCTYPE html><html><head><meta charset="utf-8">'+
        '<title>'+policyNum+' - '+policyTitle+'</title>'+
        '<style>'+
        'body{font-family:Arial,sans-serif;max-width:800px;margin:2rem auto;padding:0 2rem;line-height:1.6;color:#222}'+
        'h1{font-size:1.4rem;border-bottom:2px solid #333;padding-bottom:.5rem;margin-bottom:1rem}'+
        'h2{font-size:1.1rem;margin-top:1.5rem}'+
        'p{margin:0 0 .75rem}'+
        'ul{margin:.5rem 0;padding-left:1.5rem}'+
        'li{margin-bottom:.3rem}'+
        '.meta{font-size:.8rem;color:#666;margin-bottom:1.5rem}'+
        '</style></head><body>'+
        '<h1>'+policyNum+' — '+policyTitle+'</h1>'+
        '<p class="meta">Generated: '+new Date().toLocaleDateString()+'</p>';

    // Convert markdown-like text to HTML
    var body=text
        .replace(/^### (.+)$/gm,'<h3>$1</h3>')
        .replace(/^## (.+)$/gm,'<h2>$1</h2>')
        .replace(/^# (.+)$/gm,'<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
        .replace(/\*(.+?)\*/g,'<em>$1</em>')
        .replace(/^- (.+)$/gm,'<li>$1</li>')
        .replace(/^• (.+)$/gm,'<li>$1</li>')
        .replace(/^\d+\.\s+(.+)$/gm,'<li>$1</li>')
        .replace(/(<li>.*?<\/li>\n?)+/g,'<ul>$&</ul>')
        .replace(/\n\n/g,'</p><p>')
        .replace(/\n/g,'<br>');

    htmlContent+='<p>'+body+'</p></body></html>';

    // Open print dialog (saves as PDF)
    var printWin=window.open('','_blank','width=800,height=600');
    printWin.document.write(htmlContent);
    printWin.document.close();
    printWin.focus();
    setTimeout(function(){printWin.print();},500);
}

// --- Timeline ---
function getStages(policyNum){
    var s=tl[policyNum];
    if(!s)return newStageArray();
    while(s.length<stages.length)s.push(false);
    if(s.length>stages.length)s=s.slice(0,stages.length);
    return s;
}
function newStageArray(){
    var arr=[];
    for(var i=0;i<stages.length;i++)arr.push(false);
    return arr;
}
function getStageDatesForPolicy(policyNum){
    return stageDates[policyNum]||[];
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
    var dates=getStageDatesForPolicy(currentTlDoc.number);
    var numStages=stages.length;

    var nodesHtml='';
    for(var i=0;i<numStages;i++){
        var dateVal=dates[i]||'';
        nodesHtml+='<div class="tl-node'+(stageStates[i]?' done':((i===0||(i>0&&stageStates[i-1]))?' active':''))+'" data-stage="'+i+'">'+
            '<button class="tl-circle" data-stage-idx="'+i+'" aria-label="Mark stage complete">'+(stageStates[i]?'&#10003;':'')+'</button>'+
            '<input type="text" class="tl-label-input" data-stage-idx="'+i+'" value="'+esc(stages[i])+'" title="Click to edit label">'+
            '<span class="tl-date-display">'+(dateVal?dateVal:'')+'</span>'+
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
    var dates=getStageDatesForPolicy(currentTlDoc.number);
    // Ensure dates array is long enough
    while(dates.length<stages.length)dates.push('');
    var today=new Date().toISOString().split('T')[0];

    if(stageStates[stageIdx]){
        // Unchecking: clear this and all after
        for(var i=stageIdx;i<stages.length;i++){
            stageStates[i]=false;
            dates[i]='';
        }
    }else{
        // Checking: mark this and all before, set dates
        for(var i=0;i<=stageIdx;i++){
            stageStates[i]=true;
            if(!dates[i])dates[i]=today;
        }
    }
    tl[currentTlDoc.number]=stageStates;
    stageDates[currentTlDoc.number]=dates;
    saveTimeline();
    saveStageDates();

    // Determine status based on checked count
    var checkedCount=0;
    for(var k=0;k<stages.length;k++){if(stageStates[k])checkedCount++;}
    var newStatus;
    if(checkedCount===stages.length){
        newStatus='completed';
    }else if(checkedCount>0){
        newStatus='in-progress';
    }else{
        newStatus='needs-review';
    }
    currentTlDoc.status=newStatus;
    so[currentTlDoc.number]=newStatus;
    try{localStorage.setItem(SK,JSON.stringify(so));}catch(x){}

    renderTimeline();
    render();
}
function addStage(){
    stages.push('');
    saveStages();
    for(var key in tl){
        if(tl.hasOwnProperty(key)){
            tl[key].push(false);
        }
    }
    saveTimeline();
    renderTimeline();
    var inputs=tlNodes.querySelectorAll('.tl-label-input');
    if(inputs.length)inputs[inputs.length-1].focus();
}

// --- Delete confirmation popup ---
function showDeleteConfirm(idx){
    pendingRemoveIdx=idx;
    deleteModal.classList.add('active');
}
function hideDeleteConfirm(){
    pendingRemoveIdx=null;
    deleteModal.classList.remove('active');
}
function confirmRemoveStage(){
    if(pendingRemoveIdx===null)return;
    var idx=pendingRemoveIdx;
    hideDeleteConfirm();
    stages.splice(idx,1);
    saveStages();
    for(var key in tl){
        if(tl.hasOwnProperty(key)&&tl[key].length>idx){
            tl[key].splice(idx,1);
        }
    }
    // Remove date entries too
    for(var key2 in stageDates){
        if(stageDates.hasOwnProperty(key2)&&stageDates[key2].length>idx){
            stageDates[key2].splice(idx,1);
        }
    }
    saveTimeline();
    saveStageDates();
    renderTimeline();
}

function renameStage(idx,newName){
    stages[idx]=(newName||'').trim();
    saveStages();
}

function setStageDate(policyNum,idx,dateVal){
    if(!stageDates[policyNum])stageDates[policyNum]=[];
    while(stageDates[policyNum].length<=idx)stageDates[policyNum].push('');
    stageDates[policyNum][idx]=dateVal;
    saveStageDates();
}

// --- Policy Content (Boardable) ---
function getPolicyContent(policyNum){
    for(var i=0;i<POLICY_CONTENT.length;i++){
        if(POLICY_CONTENT[i].id===policyNum){
            var raw=POLICY_CONTENT[i].content;
            // Convert bullet formatting to HTML
            var html=esc(raw)
                .replace(/\n  • (.*?)(?=\n|$)/g,'\n<li>$1</li>')
                .replace(/\n  (\d+[\.\)]\s.*?)(?=\n|$)/g,'\n<li>$1</li>')
                .replace(/\n• (.*?)(?=\n|$)/g,'\n<li>$1</li>')
                .replace(/(<li>.*?<\/li>\n?)+/g,'<ul>$&</ul>')
                .replace(/\n\n/g,'</p><p>')
                .replace(/\n/g,'<br>');
            return '<div class="policy-text"><p>'+html+'</p></div>';
        }
    }
    return '<span class="placeholder-text">No policy content available. Run NEWscrape_policies.py to generate.</span>';
}

// --- S3 Fetch ---
function getS3Urls(policyNum){
    var key=policyNum.replace(/\s+/g,'-').replace(/[()]/g,'')+'.txt';
    var base='https://filestoragedeanzapolicy.s3.us-west-2.amazonaws.com/';
    var isAP=policyNum.indexOf('AP')===0;
    if(isAP){
        return [
            base+'administrative-procedures/'+key,
            base+'foothill-policies/administrative-procedures/'+key
        ];
    }else{
        return [
            base+'board-policy/'+key,
            base+'foothill-policies/board-policy/'+key
        ];
    }
}

function loadFromS3(docId,policyNum){
    var target=document.getElementById('s3-content-'+docId);
    if(!target)return;
    var urls=getS3Urls(policyNum);
    target.innerHTML='<span class="s3-loading">Loading...</span>';

    // Extract just the policy number for matching (e.g. "BP 1100" or "AP 2105")
    var policyId=policyNum.replace(/\s*\(.*?\)\s*/g,'').trim(); // strip "(New)" etc

    function extractPolicySection(fullText){
        // Find the section that starts with this policy number/title
        // Look for the policy header pattern like "BP 1100" at start of a line
        var escapedId=policyId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        var pattern=new RegExp('(?:^|\\n)('+escapedId+'[\\s\\S]*?)(?=\\n(?:BP|AP)\\s+\\d|$)','i');
        var match=fullText.match(pattern);
        if(match&&match[1]&&match[1].trim().length>50){
            return match[1].trim();
        }
        // Fallback: look for any paragraph containing the policy number
        var lines=fullText.split('\n');
        var capturing=false;
        var result=[];
        for(var i=0;i<lines.length;i++){
            if(!capturing&&lines[i].indexOf(policyId)!==-1){
                capturing=true;
            }
            if(capturing){
                // Stop if we hit another policy header
                if(result.length>3&&/^(BP|AP)\s+\d/.test(lines[i].trim())){
                    break;
                }
                result.push(lines[i]);
            }
        }
        if(result.length>2)return result.join('\n').trim();
        // If nothing matched, return null (will use fallback)
        return null;
    }

    // Try each URL in sequence until one works
    function tryNext(i){
        if(i>=urls.length){
            // All failed — show POLICY_CONTENT fallback
            target.innerHTML=getPolicyContent(policyNum);
            return;
        }
        fetch(urls[i])
            .then(function(r){
                if(!r.ok)throw new Error('HTTP '+r.status);
                return r.text();
            })
            .then(function(text){
                // Extract only this policy's section from the document
                var section=extractPolicySection(text);
                if(section){
                    target.innerHTML='<div class="policy-text s3-text">'+esc(section).replace(/\n/g,'<br>')+'</div>';
                }else{
                    // Document loaded but couldn't find the specific section
                    // Show the first 2000 chars as a reasonable chunk
                    var trimmed=text.length>2000?text.substring(0,2000)+'...':text;
                    target.innerHTML='<div class="policy-text s3-text">'+esc(trimmed).replace(/\n/g,'<br>')+'</div>';
                }
            })
            .catch(function(){
                tryNext(i+1);
            });
    }
    tryNext(0);
}

function init(){
    initTheme();load();render();
    themeBtn.addEventListener('click',toggleTheme);
    menuBtn.addEventListener('click',function(){sidebar.classList.toggle('open');});
    searchIn.addEventListener('input',function(){query=searchIn.value;render();});
    sortSel.addEventListener('change',function(){sort=sortSel.value;render();});

    chapterNav.addEventListener('click',function(e){
        var btn=e.target.closest('.nav-btn');if(!btn)return;
        document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        chapter=btn.dataset.chapter;
        render();
        sidebar.classList.remove('open');
    });

    filterNav.addEventListener('click',function(e){
        var t=e.target.closest('.tab');if(!t)return;
        document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active');});
        t.classList.add('active');filter=t.dataset.filter;render();
    });

    tbody.addEventListener('click',function(e){
        var expandEl=e.target.closest('[data-action="expand"]');
        if(expandEl){e.preventDefault();toggleExpand(parseInt(expandEl.dataset.id,10));return;}
        var el=e.target.closest('[data-action="detail"]');
        if(el){e.preventDefault();openD(parseInt(el.dataset.id,10));return;}
        var tlEl=e.target.closest('[data-action="timeline"]');
        if(tlEl){e.preventDefault();openTimeline(parseInt(tlEl.dataset.id,10));return;}
        // S3 load button (legacy)
        var s3Btn=e.target.closest('[data-s3-id]');
        if(s3Btn&&!e.target.closest('.markup-download-btn')){
            e.preventDefault();
            loadFromS3(parseInt(s3Btn.dataset.s3Id,10),s3Btn.dataset.s3Num);
            return;
        }
        // PDF download button
        var pdfBtn=e.target.closest('.markup-download-btn');
        if(pdfBtn){
            e.preventDefault();
            downloadPolicyPDF(parseInt(pdfBtn.dataset.id,10),pdfBtn.dataset.num,pdfBtn.dataset.title);
        }
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

    dClose.addEventListener('click',function(){dOverlay.classList.remove('active');});
    dOverlay.addEventListener('click',function(e){if(e.target===dOverlay)dOverlay.classList.remove('active');});

    tlClose.addEventListener('click',function(){tlOverlay.classList.remove('active');currentTlDoc=null;});
    tlOverlay.addEventListener('click',function(e){if(e.target===tlOverlay){tlOverlay.classList.remove('active');currentTlDoc=null;}});

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
            if(stages.length<=1)return;
            showDeleteConfirm(ridx);
            return;
        }
    });
    tlNodes.addEventListener('change',function(e){
        if(e.target.classList.contains('tl-label-input')){
            var idx=parseInt(e.target.dataset.stageIdx,10);
            renameStage(idx,e.target.value);
        }
    });

    tlAddBtn.addEventListener('click',addStage);

    // Delete confirm modal
    deleteYes.addEventListener('click',confirmRemoveStage);
    deleteNo.addEventListener('click',hideDeleteConfirm);
    deleteModal.addEventListener('click',function(e){if(e.target===deleteModal)hideDeleteConfirm();});

    document.addEventListener('keydown',function(e){
        if(e.key==='Escape'){
            dOverlay.classList.remove('active');
            tlOverlay.classList.remove('active');
            hideDeleteConfirm();
            currentTlDoc=null;
        }
    });
}
init();
})();
