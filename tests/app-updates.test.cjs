const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const model=require('../app-updates/model.js');
const {read,publish}=require('../app-updates/github-release.js');

const config=()=>model.validate({...model.defaults,revision:'installed'});

class FakePublisher {
  constructor() {
    this.owner='x-s-m-x';
    this.repository='Xotiic-Songs';
    this.head='h1';
    this.sha='config1';
    this.settings=config();
    this.blobs=new Map();
    this.files={
      'catalog.js':'ALL release states',
      'music/saved.mp3':'audio',
      'covers/saved.png':'cover'
    };
    this.calls=[];
  }

  repoPath(path) {
    return path;
  }

  async getHeadContext() {
    return {
      headSha:this.head,
      treeSha:`tree-${this.head}`
    };
  }

  async request(path) {
    assert.ok(path.startsWith('/contents/app-release.json?ref='));

    return {
      sha:this.sha,
      content:Buffer.from(JSON.stringify(this.settings)).toString('base64')
    };
  }

  async createBlob(content,encoding) {
    const sha=`blob${this.blobs.size}`;

    this.blobs.set(
      sha,
      encoding==='base64'
        ? Buffer.from(content,'base64')
        : content
    );

    return sha;
  }

  async finalizeCommit(plan) {
    this.calls.push(plan);

    if(this.race) {
      this.race=false;
      this.head='song-race';
      this.files['catalog.js']='NEW SONG COMMIT';
      throw new Error('Non fast forward');
    }

    assert.equal(plan.headSha,this.head);
    assert.equal(plan.treeSha,`tree-${this.head}`);

    for(const entry of plan.entries) {
      assert.ok(
        entry.path==='app-release.json' ||
        /^app-updates\/banner\.(png|jpg|webp)$/.test(entry.path)
      );

      this.files[entry.path]=this.blobs.get(entry.sha);

      if(entry.path==='app-release.json') {
        this.settings=JSON.parse(this.blobs.get(entry.sha));
        this.sha=entry.sha;
      }
    }

    this.head='accepted';

    if(this.lostResponse) {
      throw new Error('Connection lost after ref update');
    }

    return {
      sha:this.head,
      url:'https://example.test/commit'
    };
  }
}

test('release settings reject unknown versions and arbitrary file paths',()=>{
  assert.throws(()=>model.validate({
    ...config(),
    activeVersion:'22.0.0'
  }));

  assert.throws(()=>model.validate({
    ...config(),
    branding:{
      ...config().branding,
      banner:'../catalog.js'
    }
  }));

  assert.throws(()=>model.validate({
    ...config(),
    branding:{
      ...config().branding,
      position:NaN
    }
  }));
});

test('design switches preserve current catalog, media and branding preference',async()=>{
  const p=new FakePublisher();
  const review=await read(p);
  const before={...p.files};

  const result=await publish(p,review,{
    ...review.config,
    activeVersion:'21.1.0',
    branding:{
      ...review.config.branding,
      logo:'anime'
    }
  });

  assert.equal(result.config.activeVersion,'21.1.0');

  for(const [file,data] of Object.entries(before)) {
    assert.equal(p.files[file],data);
  }

  assert.deepEqual(
    p.calls[0].entries.map(entry=>entry.path),
    ['app-release.json']
  );

  const back=await publish(p,await read(p),{
    ...p.settings,
    activeVersion:'21.0.0'
  });

  assert.equal(back.config.branding.logo,'anime');
});

test('unrelated song commits before publishing are preserved',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  p.head='new-song';
  p.files['catalog.js']='latest draft scheduled archived live';

  await publish(p,review,{
    ...review.config,
    activeVersion:'21.1.0'
  });

  assert.equal(
    p.files['catalog.js'],
    'latest draft scheduled archived live'
  );
  assert.equal(p.calls[0].headSha,'new-song');
});

test('a racing song commit is preserved while retrying settings-only commit',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  p.race=true;

  await publish(p,review,{
    ...review.config,
    activeVersion:'21.1.0'
  });

  assert.equal(p.calls.length,2);
  assert.equal(p.calls[1].headSha,'song-race');
  assert.equal(p.files['catalog.js'],'NEW SONG COMMIT');
});

test('another owner settings change stops a stale review',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  p.sha='changed';

  await assert.rejects(
    publish(p,review,{
      ...review.config,
      activeVersion:'21.1.0'
    }),
    /changed since review/
  );

  assert.equal(p.calls.length,0);
});

test('lost final response recognizes accepted commit without duplicate commit',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  p.lostResponse=true;

  const result=await publish(p,review,{
    ...review.config,
    activeVersion:'21.1.0'
  });

  assert.equal(result.sha,'accepted');
  assert.equal(p.calls.length,1);
});

test('locked session cannot finalize and banners cannot write protected data',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  await assert.rejects(
    publish(p,review,review.config,null,()=>false),
    /locked/
  );

  await assert.rejects(
    publish(p,review,review.config,{
      path:'catalog.js',
      base64:'YWJj'
    }),
    /Invalid banner/
  );

  assert.equal(p.calls.length,0);
});

test('banner publishes atomically with config and no catalog entries',async()=>{
  const p=new FakePublisher();
  const review=await read(p);

  await publish(p,review,{
    ...review.config,
    branding:{
      ...review.config.branding,
      banner:'app-updates/banner.png'
    }
  },{
    path:'app-updates/banner.png',
    base64:'YWJj'
  });

  assert.deepEqual(
    p.calls[0].entries.map(entry=>entry.path),
    ['app-updates/banner.png','app-release.json']
  );
});

test('original default, auth, storage APIs and recovery remain production controls',()=>{
  // The fallback stays v21, while either registered design may be active.
  assert.equal(model.defaults.activeVersion,'21.0.0');

  const currentSettings=JSON.parse(
    fs.readFileSync('app-release.json','utf8')
  );

  model.validate(currentSettings);

  const html=fs.readFileSync('admin/index.html','utf8');

  assert.ok(html.includes('id="setup-form"'));
  assert.ok(html.includes('id="login-form"'));
  assert.ok(html.includes('id="logout-button"'));
  assert.ok(!html.includes('class="player-link"'));
  assert.ok(html.includes('data-admin-panel="branding" hidden'));
  assert.ok(html.includes('app-updates/recovery.html'));
  assert.ok(!html.includes('redesign/'));

  const ids=[...html.matchAll(/\sid="([^"]+)"/g)]
    .map(match=>match[1]);

  assert.equal(ids.length,new Set(ids).size);
});
