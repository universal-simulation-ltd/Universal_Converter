import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    /// Hands every scene to `SceneDelegate`.
    ///
    /// ⚠️ This method, and the `UIApplicationSceneManifest` in Info.plist, are
    /// what make this app launch at all once it is built against the iOS 27
    /// SDK: an app that has not adopted the scene life cycle is terminated
    /// immediately. Both halves are required — a manifest alone does not
    /// satisfy it, because the runtime checks that the app delegate answers
    /// this call. See `SceneDelegate.swift`; `npm run check:ios-launch`
    /// guards all three pieces.
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // ⚠️ THE FIVE METHODS BELOW ARE NEVER CALLED under the scene life cycle —
    // iOS sends the equivalents to the scene delegate instead. They are kept
    // only because they are Capacitor's template and their absence would read
    // as a deletion. All five are empty; put nothing in them. Anything that
    // needs to run on resign/background/foreground/active belongs in
    // `SceneDelegate`, or on the matching `UIApplication` notification (which
    // is what `@capacitor/app` uses, and why its `pause`/`resume` events keep
    // working).

    func applicationWillResignActive(_ application: UIApplication) {
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    // ⚠️ Also never called under the scene life cycle. `SceneDelegate` takes
    // both — a `unisim-…://` link and a Universal Link — and forwards them to
    // Capacitor the same way. Kept as the pre-scene fallback.

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
