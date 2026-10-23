# Quiz Live

A live multiplayer quiz. The host shows questions on a big screen, players join on their phones with a PIN and
answer as fast as they can. Correct answers earn 1000 points for an instant answer, falling to 500 at the buzzer.

## Try it on one computer first (no setup)

    python3 -m http.server 8000     (run inside this folder)

Open http://localhost:8000/host.html, click **Start a game**, then open http://localhost:8000/index.html in more
tabs and join with the PIN. This "demo mode" only syncs between tabs of the same browser.

## Go live (so phones can join)

### 1. Create a free Firebase database (about 5 minutes)
1. Go to https://console.firebase.google.com, sign in with a Google account, **Add project** (turn Analytics off).
2. In the left menu: **Build -> Realtime Database -> Create database**. Pick the closest location and choose
   **Start in locked mode**.
3. Open the **Rules** tab, paste the following, and click **Publish**:

       {
         "rules": {
           "games": { ".read": true, ".write": true }
         }
       }

   (Anyone with a game PIN can read/write that game. Fine for friendly games; not for sensitive data.)
4. Click the gear icon -> **Project settings** -> under **Your apps** click the web icon `</>`, register an app
   (skip hosting), and copy the `firebaseConfig = { ... }` values.
5. Open `config.js` and replace `export const firebaseConfig = null;` with
   `export const firebaseConfig = { ...the values you copied... };`
   Make sure the `databaseURL` line is included. If it is missing, the Realtime Database page shows the URL at the top.

### 2. Put it on GitHub Pages
1. Create a new GitHub repository (public) and upload everything in this folder (keep the folder structure).
2. Repo **Settings -> Pages -> Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, folder `/ (root)`. Save.
3. After a minute your game is at `https://YOUR-NAME.github.io/REPO-NAME/`.
   - Host opens `.../host.html` (on a laptop connected to a projector/shared screen)
   - Players open `.../` (or scan the QR code on the host screen)

The Firebase `apiKey` in config.js is meant to be public; the Rules above are what control access.

## Running a game
1. On `host.html` edit your questions (tick the circle for the correct answer, choose the time limit, reorder or
   duplicate questions). Changes save automatically in that browser. Use **Export** / **Import** to keep several quizzes.
2. **Start a game**, share the PIN or QR code, wait for players, **Start quiz**.
3. Each question ends when the timer runs out or everyone has answered. Click **Next question** after the leaderboard.
4. At the end click **Finish & clear game data** to delete the game from the database.

Notes: players can only join while the game is in the lobby. If the host refreshes the page, the game resumes.
The correct answers are kept on the host's device and are not sent to players until the reveal.
