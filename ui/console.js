(() => { 'use strict'; const root=document.documentElement; window.XotiicRelease.ready.then(() => { if(root.dataset.previewUi==='baseline21') return;
  const search=document.createElement('input');search.className='xd-manage-search';search.type='search';search.placeholder='Search releases';search.setAttribute('aria-label','Search releases');
  const list=document.getElementById('release-list');
  if(list){
    const controls=document.createElement('div');controls.className='xd-catalog-controls';
    const filters=document.querySelector('.release-filters');
    list.before(controls);controls.append(filters,search);
    const workspace=document.createElement('div');workspace.className='xd-release-workspace';
    const library=document.createElement('div');library.className='xd-release-library';
    const dock=document.createElement('aside');dock.className='xd-editor-dock';dock.setAttribute('aria-label','Release editor');
    const empty=document.createElement('div');empty.className='xd-editor-empty';
    const title=document.createElement('h2');title.textContent='Edit release';
    const hint=document.createElement('p');hint.textContent='Choose Edit on a release to work on its artwork, audio, lyrics and visibility here.';
    empty.append(title,hint);dock.append(empty);list.before(workspace);workspace.append(library,dock);
    library.append(document.getElementById('catalog-loading'),list,document.getElementById('manage-empty'));
    const apply=()=>{const query=search.value.trim().toLowerCase();list.querySelectorAll('.managed-release').forEach(row=>{row.hidden=!!query && !row.textContent.toLowerCase().includes(query);});};
    search.addEventListener('input',apply);new MutationObserver(apply).observe(list,{childList:true});

    // Reuse the existing editor and save handler. Only its presentation changes.
    const layer=document.getElementById('edit-release-modal');
    const form=document.getElementById('edit-release-form');
    const summary=document.createElement('div');summary.className='xd-editor-summary';
    const cover=document.createElement('img');cover.alt='Selected release artwork';
    const copy=document.createElement('div');const name=document.createElement('strong');const caption=document.createElement('small');caption.textContent='Editing this release';copy.append(name,caption);summary.append(cover,copy);
    document.getElementById('edit-release-id').after(summary);
    const details=document.createElement('details');details.className='xd-editor-details';
    const detailsTitle=document.createElement('summary');detailsTitle.textContent='Metadata, discovery & credits';
    const extra=document.createElement('div');extra.className='edit-field-grid';details.append(detailsTitle,extra);
    const core=document.querySelector('#edit-release-form > .edit-field-grid');
    const retained=new Set(['edit-title','edit-audio-file','edit-cover-file','edit-lyrics','edit-status','edit-schedule']);
    for(const field of [...core.children]){
      const input=field.querySelector('input,select,textarea');
      if(input&&!retained.has(input.id)&&input.type!=='hidden')extra.append(field);
    }
    // Keep the reference's working sequence: title, assets, lyrics, visibility.
    for(const id of ['edit-title','edit-audio-file','edit-cover-file','edit-lyrics','edit-status','edit-schedule']){
      const field=document.getElementById(id)?.closest('.field');if(field&&field.parentElement===core)core.append(field);
    }
    core.after(details);
    form.addEventListener('invalid',event=>{const parent=event.target.closest('details');if(parent)parent.open=true;},true);
    const wide=window.matchMedia('(min-width: 1180px)');
    const syncEditor=()=>{
      const inline=wide.matches&&root.dataset.previewUi!=='baseline21';layer.classList.toggle('xd-inline-editor',inline);
      if(inline&&layer.parentElement!==dock)dock.append(layer);
      if(!inline&&layer.parentElement===dock)document.body.append(layer);
      form.setAttribute('role',inline?'region':'dialog');
      if(inline)form.removeAttribute('aria-modal');else form.setAttribute('aria-modal','true');
      empty.hidden=!layer.hidden;
      if(!layer.hidden){
        if(inline)document.body.classList.remove('modal-open');else document.body.classList.add('modal-open');
        name.textContent=document.getElementById('edit-title').value;
      }
      const idText=document.getElementById('edit-release-id').textContent;
      list.querySelectorAll('.managed-release').forEach(row=>{
        const id=row.querySelector('[data-release-edit]')?.dataset.releaseEdit;
        const selected=!layer.hidden&&id&&idText.startsWith(`Release ID: ${id} ·`);
        row.classList.toggle('xd-selected',!!selected);
        if(selected){const source=row.querySelector('img');cover.hidden=!source;if(source)cover.src=source.src;}
      });
    };
    wide.addEventListener('change',syncEditor);
    document.addEventListener('xotiic:updatepreview',syncEditor);
    new MutationObserver(syncEditor).observe(layer,{attributes:true,attributeFilter:['hidden']});
    new MutationObserver(syncEditor).observe(list,{childList:true});
    document.getElementById('edit-title').addEventListener('input',()=>{name.textContent=document.getElementById('edit-title').value;});
    document.addEventListener('xotiic:adminpanel',event=>{if(event.detail.panel!=='releases'&&!layer.hidden)layer.querySelector('[data-edit-close]').click();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!layer.hidden)layer.querySelector('[data-edit-close]').click();});
    syncEditor();
  }

});})();
