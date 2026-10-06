# I/O and OUTPUT

I/O stays at `/`. OUTPUT, the print-shop job inbox, is at `/output`.

```bash
npm install
npm run dev
```

Open [http://localhost:5000](http://localhost:5000) for I/O and [http://localhost:5000/output](http://localhost:5000/output) for OUTPUT. `npm run check` runs the TypeScript check.

OUTPUT reuses this app's glass strip. It does not use clock-in, wages, or points. With `VITE_OUTPUT_API_BASE` unset, OUTPUT is labeled **Demo data—no orders sent or money moved.** See `client/src/output/BACKEND.md` for the operations Ez Ink still has to connect. There is no installer.

# I/O

**Input vs Output.** A tiny trading-terminal strip that gamifies work.

```
I/O   +4.00
```

The strip is a glass widget on the right, meant to sit on a Mac or Windows desktop. **I/O** clocks you in and out. Hover it to see Clock in or Clock out. The three squares above the strip stay gray until you clock in. Then they bounce back and forth at one tempo and change color. The numbers are the shared book: green is money collected, red is wages. A thin bar under them shows which side is winning, green from the left and red from the right. A change flashes only `+$200` or `−$20`. Collapse it to just **I/O**. **+** opens points and Settings. **Settings** is the company. Join takes a code. Create takes a name and spins up a code that is also an invite link. Once you are in, the company name replaces the word Company, and the code sits on the right. The person who created the company can open **Change**, see everyone, and set what each person makes per hour. Wages flash red. Collected money flashes green.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5000. Each PC links to one person, then **I/O** clocks that person in and out. The green and red numbers stay the whole business.

```bash
npm run build
npm start
```

A paid hour is a real hour. Wages, collected money, the rate, and the company are written to `data/io-state.json` (or `DATA_DIR`) and survive a restart. Copy `.env.example` for the port. `GET /api/health` is the process check.

## Push to your empty GitHub repo

```bash
# from this folder
git init -b main
git add -A
git commit -m "Initial commit: I/O trading-terminal work HUD"
git remote add origin https://github.com/Ferxxo-pa/I-O.git
git push -u origin main
```
