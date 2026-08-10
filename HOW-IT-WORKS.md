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
n8n fetches the document
   downloads the PDF or Word file, pulls the text out
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
   drafted questions for the agency - a first proposal draft
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

**Read three times** because one read can be a bad read. The three are reconciled: the
classifications are voted on, the compliance checklists are merged, and a mandatory requirement
only closes a bid when all three reads agree it fails.

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

- **An RFP attached to an email is not read** - only links in the body. An agency that attaches
  the PDF gets triaged on the covering note alone.
- **A digest email listing twelve notices becomes one row**, not twelve.
- **An addendum that amends a live RFP** creates a second entry rather than updating the first.
- **Verdicts live in the dashboard only.** No Slack, no email.
- **The proposal draft uses a generic section list**, not Caravann's own Word template, and does
  not yet read the required sections out of the solicitation itself.
- **No AI-detection pass** on drafts.

---

## The honest status

The machinery works and is tested end to end.

The judgement it applies is not Khaled's yet. Every threshold and every sector figure is currently
a placeholder, so the verdicts are **consistent and explainable, but not yet correct** - and
nobody can say otherwise until step 3 above has run twenty times.
