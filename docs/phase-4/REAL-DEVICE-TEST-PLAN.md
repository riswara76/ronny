# DCU Active — Real-Device Test Plan (iPhone Safari + Android Chrome)

This test cannot be automated from the build environment: it needs your physical phones.
Use the **staging URL** (`STAGING_SITE_URL`).
Use two accounts so the conflict test is real: your own new registration plus `STAGING_USER1_EMAIL`.

Record **Pass / Fail + a note or screenshot** for every row and send the filled table back (a photo of a printout is fine).
Any Fail is fixed and re-tested before Phase 4 is declared complete.

**Devices**

- **A** iPhone, Safari: iOS version ____
- **B** iPhone, installed Home-Screen app (Safari → Share → *Add to Home Screen*)
- **C** Android phone, Chrome: model ____ / Android ____ / Chrome ____

| # | Step | Expected | A | B | C |
|---|---|---|---|---|---|
| 1 | Open the staging URL (type it, or scan a QR code) | Login page, no browser warnings, padlock shown | | | |
| 2 | **Register** with your real email (name, email, password; try a weak password first) | Weak password shows the unmet rules; strong one → "Check your email" | | — | |
| 3 | Open the verification email **on the phone** → tap "Confirm my email" link → press **Confirm my email** | "Email verified" → Continue → Home greets you by first name | | — | |
| 4 | (Second email) Register another address, use the **6-digit code** instead of the link | Verified and signed in | | — | |
| 5 | **Log out → Log in** | Home shown; wrong password shows "Incorrect email or password." | | | |
| 6 | **Session persistence**: close the tab/app completely, reopen after 1 minute | Still signed in, Home shown | | | |
| 7 | **Book Tennis** tomorrow, 60 minutes | Durations only show what fits; review → **Booking confirmed** with code | | | |
| 8 | **Basketball/Futsal**: choose Basketball, book a time; with the 2nd account open Futsal at the same time | Slot shows **Booked** for Futsal | | | |
| 9 | **Air Hockey**: book; on the 2nd account the same time shows "1 spot left" | Correct counts; no table number shown | | | |
| 10 | **Live update**: keep account 2 on Tennis tomorrow; book 07:00 with account 1 | Account 2's 07:00 turns **Booked** within a few seconds, without refresh | | | |
| 11 | **Conflict**: both accounts select the same free slot and open Review; confirm on 1, then on 2 | Account 2: "Sorry, this time slot was just booked by another user…" and the grid refreshes | | | |
| 12 | **Cancel** a booking from My Bookings | Confirmation dialog → moves to History "Cancelled"; slot available again | | | |
| 13 | **Check-in**: admin creates a booking for "now" (I can prepare one on request), or book the next half-hour slot and wait | Button disabled with "Check-in opens at HH:MM" before the window; enabled inside it → **Checked in** | | | |
| 14 | **Offline**: turn on airplane mode on the booking screen | "You are offline…" message, no times shown, Review disabled; back online → times return | | | |
| 15 | **Rotate** to landscape / use large text (iOS Text Size / Android font size) | Layout usable, nothing cut off | | | |
| 16 | **Forgot password** → email link → new password → log in | Works; old password rejected | | — | |
| 17 | Home-Screen app only: launch from icon | Opens full-screen with the DCU Active icon/name; booking works | — | | (optional on C: Chrome menu → *Install app*) |

Notes for testers:

- All times are Jakarta time (WIB), even if the phone is set to another timezone.
- The 2nd account can be another phone, or a desktop browser.
