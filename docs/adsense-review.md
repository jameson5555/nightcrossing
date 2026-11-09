# AdSense review preparation — November 9, 2026

## Current decision

Keep the separate About and How to Play pages and the game footer links.
Remove the game-menu tagline and the introductory block that flashed during
normal loading. Retain a small JavaScript-disabled fallback only. The production
build and fallback-link checks pass for this cleanup.

The user will request another AdSense review after deploying the remaining
cleanup. Pre-rendering the actual game menu is explicitly deferred until after
the review outcome; no pre-rendering or hydration changes are included here.

## Findings

The supplied AdSense screenshot reports two findings: **Google-served ads on
screens without publisher-content** and **Low value content**. It does not
identify a particular URL or say whether Google evaluated the rendered game.
Do not assume that the reviewer could not run JavaScript, or that the homepage
alone caused the decision.

Google says it [reviews the entire site](https://support.google.com/adsense/answer/7584263?hl=en).
Keeping a personal landing page with unrelated projects in subfolders is not a
listed violation. The practical goal is to make the original projects and their
value easy to discover, understand, and use. Do not create filler articles or
change the site's subject merely to meet an invented word or page quota.

Public checks on November 9:

- The live homepage has the animation, social links, a Nightcrossing card, and
  the `google-adsense-account` verification meta tag. It provides almost no
  explanation of the publisher or game.
- The live game's initial HTML has a description but an empty React root. Its
  content depends on loading JavaScript. That is an observation, not proof of a
  crawl failure.
- Root `ads.txt` returns HTTP 200 and contains
  `google.com, pub-6539140496743179, DIRECT, f08c47fec0942fa0`.
- Root `robots.txt` returns HTTP 404. A missing robots file is not, by itself, a
  crawler block. Hosting access logs and Search Console inspection have not been
  checked.
- The local root `../index.html` is older than the live homepage. It lacks the
  current game card and verification tag. Do not upload it over the live page.
- The rewarded-ad provider requests only an explicit rewarded placement. It
  does not itself insert display ads on the homepage or menu. Google Tag Manager
  configuration and AdSense Auto ads settings have not been inspected.

## Changes prepared locally

- `public/how-to-play.html`: real controls, a worked solving example, hints,
  progression, saved progress, and clue-reporting instructions.
- `public/about.html`: publisher identification and an explanation of the game,
  its puzzle collections, and its automated assembly and quality checks.
- Game menu: direct links to both pages and Privacy. The introductory tagline
  was subsequently removed at the user's request to keep the game minimal.
- `index.html`: the initial descriptive block was removed after it caused a
  visible flash during normal loading. A `noscript` message and information
  links are shown only when JavaScript is disabled. Normal loading adds no
  introductory screen. The explanatory content remains on the separate About
  and How to Play pages, linked from the game footer and homepage. The
  `noscript` fallback is for visitors without JavaScript, not a substitute for
  rendered game content or a guarantee about AdSense review.
- `public/sitemap.xml`: discoverable game and information-page URLs. It does not
  claim the private JSON puzzle payloads are separate web pages.
- `docs/adsense/homepage-index.html`: a proposed root homepage based on the live
  version. Revised after the user's November 9 screenshot: removes the added
  paragraphs and promotional card, restores the social icons as the first
  content in the contact section, and adds three small text links underneath.
  The links sit in the existing bottom space without adding normal-flow height
  that would change the social row's final position. Retains the animation
  markup and scripts, analytics, and AdSense verification. This file is outside
  Vite's public directory and is not deployed with the game build. Check it
  against the live version again before uploading.

These are usability and discovery improvements. Google does not promise approval
for adding an About page, a privacy notice, instructions, a sitemap, or any
particular number of words. Its [content and user-experience guidance](https://support.google.com/adsense/answer/10015918?hl=en)
asks for substantial original value and reasons for people to return.

## Local validation

The production web build passes. Built-page checks confirm that the game,
playing guide, About, and Privacy pages have one main heading, their local links
resolve, and the sitemap lists existing build outputs. The two new information
pages contain no scripts or ad placements. The homepage proposal retains the
live publisher verification ID, analytics ID, animation markup, and social
links. The revised homepage has not been visually verified. `git diff
--check` passes. Browser automation is unavailable in this session; rendered
desktop/mobile layout and a game play-through remain to be checked.

The initial proposal was subsequently published to the live homepage outside
this session, as confirmed by the user's screenshot and a public HTML fetch.
The revision removing that proposal's text and card remains local. This session
has not overwritten the domain root file, pushed or deployed changes, or
submitted an AdSense review request.

## Minimal homepage and disclosure options

Extra homepage paragraphs are not a stated AdSense requirement. Keep the useful
game information on the actual game pages, with clear links to reach it. The
homepage can remain an ad-free personal landing page. This is a design
recommendation consistent with Google's content and navigation guidance, not
an assurance that AdSense will approve this particular site.

The revised proposal uses three plain links below the social icons. An
alternative is a native `details` element labeled Projects with the links in
its initial HTML. Google Search explicitly allows ordinary accordions used for
user experience in its [hidden-text guidance](https://developers.google.com/search/docs/essentials/spam-policies#hidden-text-and-link-abuse).
That Search guidance does not establish AdSense approval. Do not rely on a
crawler clicking a control to fetch content: Google Search documents that it
does not interact with pages in its [lazy-loading guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading).
Keep direct URLs and the game pages independently reachable in either design.

## Before another review

1. Publish the game build containing the new pages. The existing cPanel workflow
   uploads `dist/`, including these public assets. Preview the menu on a phone
   and desktop, open both information pages, and complete a short play-through.
2. Review the proposed root update separately; it must be uploaded to the domain
   root, not `/nightcrossing/`. Keep the root landing page free of ad placements.
   The verification meta tag verifies ownership without creating an ad placement.
3. Check other publicly linked projects for unfinished screens, broken links,
   embedded or copied material without added value, and ad tags on utility or
   empty screens. This session did not audit every other project. Do not delete,
   hide from reviewers, or block legitimate pages to evade the site review.
4. Check the published Tag Manager container and AdSense Auto ads settings.
   Ensure generic display ads are not being inserted on navigation, loading,
   error, sign-in, privacy, or other utility screens. H5 rewards should remain
   tied to explicit game actions. See [Google's screen-content policy](https://support.google.com/publisherpolicies/answer/11112688?hl=en).
5. Inspect the homepage, game, and playing guide with Search Console URL
   Inspection, including the rendered page and screenshot where available.
   Submit `https://jamesonmacarthur.com/nightcrossing/sitemap.xml` after it is
   live. Sitemap submission is a discovery aid, not an AdSense approval step.
6. Review representative puzzles as a player for accuracy, clarity, thematic
   relevance, and enjoyable play. The code has automated generation and content
   gates, and the November 3 historical cleanup report records reviewed source
   entries; automated passes do not establish manual editorial review of every
   future puzzle. Google's screen-content policy explicitly cautions against
   ads on automatically generated content without manual review or curation.
7. Check that the actual game is getting genuine use and that the account setup
   tasks are complete. The screenshot mentions sustained user interest, but gives
   no numerical traffic threshold. No account analytics were inspected here.
8. Once the deployed site has been checked, return to **Sites →
   jamesonmacarthur.com**, confirm the issues are fixed, and request review.
   Local changes alone do not change what Google sees. Keep live advertising
   disabled until the account and site are approved and ad launch setup is done.

## Draft H5 follow-up, if a reply or account support is available

This is a draft only; no email or support message has been sent.

> My H5 Games Ads application for jamesonmacarthur.com was approved. The domain
> is a personal site containing original browser games in subfolders, including
> Nightcrossing at https://jamesonmacarthur.com/nightcrossing/.
>
> AdSense site review reports “Google-served ads on screens without
> publisher-content” and “Low value content.” I understand that H5 acceptance
> does not replace AdSense account and site approval.
>
> Can you advise on the appropriate review route for an original HTML5 game
> under an approved H5 application? Can support identify any example affected
> URLs or confirm whether the rendered game is accessible during review? I want
> to address the actual content issue while keeping the domain's homepage as a
> simple personal landing page.

After deploying and verifying the changes, describe the new playing guide and
information links in any follow-up. Do not claim they are live beforehand.
