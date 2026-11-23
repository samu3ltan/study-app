# Setup checklist

## Sam (one-time, ~2-3 hours)
- [x] Install Xcode from the Mac App Store, open it once, accept the license (done 2026-11-22)
- [x] GitHub account connected (samu3ltan)
- [ ] Create an EMPTY private repo named `study-app` at github.com/new (no README, no .gitignore); Claude can't create repos from chat
- [ ] Enroll in the Apple Developer Program as an individual ($99/year). Not needed yet: needed before the first TestFlight build
- [ ] Google AI Studio account + Gemini API key, with a monthly spending cap (optional for now: Phase 0 starts with Anthropic only)
- [x] Anthropic API key exists. Check a monthly spending cap is set; consider a separate key just for this project
- [ ] Supabase account (free tier; not needed until sync work)
- [x] Cloudflare account exists (docerehub.com). Later: a separate R2 bucket and API token scoped to that bucket only, so the app can never touch the website
- [ ] Copy `.env.example` to `.env` in this folder and paste the keys there yourself (never into chat)
- [ ] Collect ~30 pages you're allowed to use (15 medicine, 5 biology, 5 chemistry, 5 physics) into `eval/benchmark/<subject>/`
- [ ] Decide on the human security review (budget, timing)

## Claude (after the above)
- [ ] Create the private GitHub repo and push this folder
- [ ] Phase 0: server AI pipeline, benchmark scoring, .apkg export
- [ ] Multiplatform Xcode project; first TestFlight build to Sam's iPhone
