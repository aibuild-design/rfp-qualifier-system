# How this works

No jargon. If you want the technical version it is in [README.md](README.md).

---

## The problem

Khaled runs Caravann. Government agencies publish **RFPs** - invitations to bid on contracts
worth $45K to $185K. He gets a stream of them by email.

Reading one properly and deciding whether to bid takes about **three hours**. At $285/hr that is
**$855**, spent mostly on solicitations he ends up declining.

He is paying a fortune to find out what *not* to do.

## The goal

**Decide whether a solicitation is worth Caravann's time, before anyone spends hours on it.**
Go, maybe or no-go, with the reasoning shown.

Everything else in this system is in service of that one sentence.

---

## What happens to a solicitation

```
It arrives
   an email that mentions an RFP, or you paste one in yourself
        |
n8n gets the document
   the PDF attached to the email, or a link in the body, or the text
   you pasted - whichever is the real solicitation
        |
It is read three times
   by Claude, against Caravann's profile: what you do, where you have
   worked, what you are certified for, what insurance you carry
        |
The app decides
   the score and the verdict are computed in CODE, not by the model
        |
It lands on the dashboard
   verdict - why - what would disqualify you - compliance checklist -
   drafted questions for the agency - a suggested team - a first draft
```

**n8n is the errand runner.** It watches the inbox, fetches documents, calls the model, files to
Drive. It moves things around and can be changed without a deploy.

**The app is the judge.** It owns Caravann's profile, computes the score, decides the verdict,
and shows everything. It is deliberately the only thing that decides anything.

---

## The one decision that matters

**The model reads. The code decides.**

Originally the model picked the verdict itself. The same document, run five times, scored
`55, 82, 86, 88, 90` - and one of those was a `no_go` on a bid Caravann should have won.

So the model no longer chooses. It answers five fixed questions with fixed options:

> *Is Caravann's depth in this sector **none**, **thin**, **adequate**, or **strong**?*

and the score is arithmetic on those answers. Same document, same verdict, every time. And the
thresholds are Khaled's to set, not something to argue with a model about.

**Read three times, concurrently** because one read can be a bad read. The three are reconciled: the
classifications are voted on, the compliance checklists are merged, and a mandatory requirement
only closes a bid when all three reads agree it fails.

---

## What lands on the card

Every solicitation gets one page with everything on it.

**The verdict** - go, maybe or no-go, the score, and the reasoning in plain
prose. Underneath, the five scored dimensions with the level each was given.

**Disqualifier checks** - every mandatory requirement the solicitation names,
marked pass, fail or unconfirmed against Caravann's profile.

**Compliance checklist** - page limits, fonts, submission method, insurance,
both deadlines. The things that lose a bid on a technicality rather than on
merit.

**Gap list** - what a partner firm would need to bring, if anything.

**Drafted questions** - what is worth asking the agency before the question
window shuts. You approve, then mark them sent.

**Suggested team** - see below.

**Proposal draft** - assembled from Caravann's own approved language, section by
section. A section with nothing on file comes back marked *needs writing by
hand* rather than filled with invented text, because this goes to a public
agency.

**Do you agree with this verdict?** - where you disagree, and say why.

---

## The team

Caravann is not one person. The roster holds the **thirteen consultants** from
Caravann's own capability deck:

> Khaled El-Sawaf (principal and lead facilitator), Kia Afcari, Terrell Holmes,
> Emiliana Simon-Thomas, Crystal Fullwood, Deb Samuel, Sarah Lightfoot,
> DB Bedford, Brenda Goodwin, Trent Wakenight, Priscilla Kwok, Isabel Gabaldon,
> Trudie Mitschang.

Each carries what they do - executive coaching, graphic recording,
organisational psychology, change and communications - taken from the deck, not
invented.

**Team match** reads the solicitation's stated minimum requirements and ranks the
roster against them, with a one-line reason each: *"satisfies 2 of 3 stated
minimums"*. Deliberately keyword-based rather than another model call, because
the roster is small and a recommendation you can check beats a score you cannot.

**Nothing is ever auto-assigned.** Each name comes with a Confirm button and
stays a suggestion until you press it. Re-running the matcher clears the
suggestions and never touches a confirmation you already made.

Bandwidth (open, limited, full) tips the ranking but never rules anyone out - if
one person is the only one who satisfies a stated minimum, they surface even at
capacity, because that is a fact about the bid rather than a scheduling problem.

**What is still missing:** rates. Only Khaled's is recorded, at $285/hr. Without
the rest, the cost side of a proposal cannot be assembled.

---

## Folders

The queue sorts by score and filters by verdict, which answers *what is worth
doing* but not *what am I working on this month* or *what is the transit pile*.

So you can make folders, rename them, file solicitations into them, and group
them. Each chip shows how many are inside.

Deleting a folder asks you to type **delete**, and says plainly what happens:
the solicitations inside are **not** deleted, they return to the unfiled queue
with their verdicts intact. A folder is a label; the bids are the work.

---

## It runs in the background

Submitting does not tie you to the page. The row appears in the queue at once,
the reading happens on the server, and you can close the tab.

While anything is being read, the rail shows a pulsing **"Being read now"** that
links straight to it and says how long. It clears itself when the last one
lands - the page updates on its own, with no refreshing.

The document is read **three times at once** rather than one after another. On a
short solicitation that is invisible; on a forty-page one it is the difference
between paying the model's latency once and paying it three times.

**How long:** about 40 seconds for a short solicitation, around 75 for a
thirty-four page one. Measured, not estimated.

---

## Three things it does on purpose

**It says when it does not know.** If the profile does not record whether Caravann carries $2M
insurance, the desk does not guess and it does not fail you. It answers **unclear**, holds the
verdict at *maybe*, and names the question. Every unclear is something you answer once in
Settings and never see again.

**It refuses to sound certain about invented data.** Until someone ticks *Profile confirmed*,
every verdict is stamped **provisional** and the dashboard says why. Confirming later does not
un-stamp old verdicts, because a verdict reached against placeholder data does not become correct
retroactively.

**Nothing submits itself.** No auto-submit, no legal determination, no assignment without
confirmation. The desk flags, drafts and checks. A person approves.

---

## What you have to do

**1. Fill in the profile.** Settings, about 45 minutes. The sector numbers matter most - sector
depth is worth 30 of the 100 points, the heaviest single lever in the score.

**2. Tick "Profile confirmed."** Verdicts stop saying provisional.

**3. Use it, and disagree with it.** Every verdict card asks *"Do you agree with this verdict?"*
Answer it, and say why. That is the only thing that tells anyone whether the desk is any good.

**4. After about twenty, we compare.** Your calls against the desk's. That is the first real
accuracy number, and the disagreements say what to change - almost always a number in Settings
rather than code.

---

## What it does not do yet

Worth knowing up front rather than discovering:

- **A digest email listing twelve notices becomes one row**, not twelve.
- **An addendum that amends a live RFP** creates a second entry rather than updating the first.
- **Verdicts live in the dashboard only.** No Slack, no email.
- **The proposal draft uses a generic section list**, not Caravann's own Word template, and does
  not yet read the required sections out of the solicitation itself.
- **No humanisation pass** on drafts yet, so they can read as machine-written to a
  procurement reviewer.
- **Verdicts do not reach you.** They wait in the dashboard rather than arriving
  in Slack or by email.

---

## The honest status

The machinery works and is tested end to end.

The judgement it applies is not Khaled's yet. Every threshold and every sector figure is currently
a placeholder, so the verdicts are **consistent and explainable, but not yet correct** - and
nobody can say otherwise until step 3 above has run twenty times.
