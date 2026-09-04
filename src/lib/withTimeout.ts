/**
* Races a promise against a timeout so a hung native call (SecureStore,
* AsyncStorage, etc.) can never block app startup forever.
*
* Added to diagnose/guard against the production black-screen bug: the app's
* root gate (see src/app/_layout.tsx) waits on a stored-session read and a
* stored-volume-pref read before it will render anything past the loading
* spinner. If either native call never resolves or rejects (a real
* possibility with SecureStore's Keystore-backed storage on some devices),
* the spinner - which renders on the app's near-black background color -
* stays up forever, which looks exactly like a stuck black screen. This
* wrapper guarantees those calls always settle within `ms`, and logs loudly
* when that happens so it shows up in `adb logcat`.
*/
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`[withTimeout] "${label}" did not settle within ${ms}ms - using fallback value`);
      resolve(fallback);
    }, ms);
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.error(`[withTimeout] "${label}" rejected - using fallback value`, err);
        resolve(fallback);
      }
      );
  });
}
