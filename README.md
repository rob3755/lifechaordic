# LifeChaordic for Windows and Android

An installable web app (PWA). It has the same features as the iPhone app (Quick Capture, Break It Down, routines, notes, documents) and keeps all data on the device it's installed on. It works offline and doesn't sync.

## Try it on this Mac

    python3 -m http.server 8765 --directory web

Then open http://localhost:8765.

## Put it online so Windows and Android can install it

It has to be served over HTTPS. Any static web host works. For example, GitHub Pages (free):

1. Put the contents of this `web` folder in a GitHub repository.
2. In the repository, open Settings → Pages and choose the branch.
3. Open the address GitHub gives you:
   - On **Windows**, use Edge or Chrome and click the "Install" icon in the address bar. LifeChaordic then appears in the Start menu like any app.
   - On **Android**, use Chrome: menu ⋮ → "Install app". The icon then appears on the home screen.

## Moving data from iPhone

On iPhone, go to Settings → Export Backup. Send the file to the PC or phone, then in this app go to Settings → Restore from Backup. Backups also go the other way.

## App stores (optional)

pwabuilder.com can wrap the hosted app into a Microsoft Store package and a Google Play package. Each store needs its own developer account.
