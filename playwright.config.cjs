const {defineConfig} = require("@playwright/test");
module.exports=defineConfig({
  testDir:"./tests/browser", timeout:45000, retries:process.env.CI ? 1 : 0,
  use:{baseURL:"http://127.0.0.1:4173",browserName:"chromium"},
  projects:[
    {name:"phone",use:{viewport:{width:320,height:740}}},
    {name:"tablet",use:{viewport:{width:834,height:1112}}},
    {name:"desktop",use:{viewport:{width:1440,height:1000}}}
  ],
  webServer:{command:"npm run dev",url:"http://127.0.0.1:4173",reuseExistingServer:!process.env.CI}
});

