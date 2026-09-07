import {defineConfig} from "vite";
import fs from "node:fs";
export default defineConfig({
  server:{host:"0.0.0.0",allowedHosts:["terminal.local"]},
  plugins:[{name:"console-visual-fixture",configureServer(server){
    server.middlewares.use((req,res,next)=>{
      if(req.url?.split("?")[0]!=="/tests/console-preview.html")return next();
      const html=fs.readFileSync(new URL("./admin/index.html",import.meta.url),"utf8")
        .replace("<head>",'<head><base href="/admin/">')
        .replace("</head>",'<script defer src="/tests/console-demo.js"></script></head>');
      res.setHeader("Content-Type","text/html");res.end(html);
    });
  }}]
});
