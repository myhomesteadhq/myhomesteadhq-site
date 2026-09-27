# /beta click tracking (Netlify Functions + Blobs)

myhomesteadhq.com is served by **GitHub Pages**, so it can't run Netlify Functions itself.
These two functions run on a separate free Netlify project, `homestead-hq-beta-stats`
(https://homestead-hq-beta-stats.netlify.app), and `beta.html` calls it with `navigator.sendBeacon`.

This folder starts with `_`, so GitHub Pages (Jekyll) does not publish it.

- `track`: `POST /.netlify/functions/track?ev=visit|step1|step2|demo&src=ig[&new=1]`.
  Stores one tiny blob per event (`e/<src>/<event>/<time>-<random>`) in the `beta-events` store.
  No IP, user agent, cookies or IDs. Hits with an `Origin` other than myhomesteadhq.com are ignored.
- `beta-stats`: `GET /.netlify/functions/beta-stats?key=<BETA_STATS_KEY>` shows an HTML table.
  Add `&format=json`, `&since=YYYY-MM-DD`, or `&reset=<src>&confirm=yes` to delete one source's events.

Deploy (after `npm install`): `netlify deploy --prod --dir public --functions netlify/functions`
from this folder, linked to site id `c221b863-98dc-4dac-9c29-b6bff2ced79a`.
The key is the `BETA_STATS_KEY` env var on that Netlify project.
