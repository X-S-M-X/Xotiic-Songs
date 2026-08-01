# Deploy XotiicDuck Music on GitHub Pages

## Initial upload from VS Code

Open this extracted folder in VS Code and confirm `index.html` is at the top level. In the terminal run:

```powershell
git init -b main
git add .
git commit -m "Launch XotiicDuck Music and artist console"
git remote add origin https://github.com/x-s-m-x/Xotiic-Songs.git
git push -u origin main
```

Then open **GitHub repository → Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, `main`, and `/ (root)`, then save.

The public player will be located at:

`https://x-s-m-x.github.io/Xotiic-Songs/`

The private console will be located at:

`https://x-s-m-x.github.io/Xotiic-Songs/admin/`

## Important order

Push the complete package and wait for GitHub Pages to finish before creating the admin vault. The console needs an existing `main` branch and `catalog.js`.

## Future updates

Music published through Xotiic Upload is committed directly to `main`. GitHub Pages will redeploy automatically. Source changes made in VS Code can still be committed and pushed normally.

To publish a replacement package over an existing local checkout, copy the replacement files into that checkout and run:

```powershell
git add .
git commit -m "Improve mobile layout and installation"
git pull --rebase origin main
git push origin main
```

After GitHub Pages finishes, refresh the website once. This package uses a new offline-cache version so previously opened phones and installed copies receive the responsive layout and corrected install flow.
