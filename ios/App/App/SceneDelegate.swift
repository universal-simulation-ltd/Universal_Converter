import UIKit
import Capacitor

/// The window's owner under the **UIScene life cycle**, which iOS requires of
/// an app built against the iOS 27 SDK: without it the process is killed at
/// launch ("UIScene life cycle is required for apps built with this SDK"),
/// before any of our code or the web view runs.
///
/// This is Capacitor 8.5's own `SceneDelegate` template, unchanged: the window
/// and `CAPBridgeViewController` built in code, and every callback handed to
/// Capacitor's `SceneDelegateProxy`. The proxy posts what Capacitor's plugins
/// read for a `unisim-…://` suite link or a Universal Link (the same
/// notifications `ApplicationDelegateProxy` used to), and holds a cold-start
/// link back until the bridge's plugins are listening.
///
/// ⚠️ Under the scene life cycle iOS never calls `AppDelegate`'s
/// `application(_:open:options:)`, `application(_:continue:…)` or the
/// `applicationDid…`/`applicationWill…` activity methods. Anything that has
/// to happen on a URL, a Universal Link or a foreground change belongs here.
/// `npm run check:ios-launch` fails the build if one of the three proxy calls
/// below goes missing.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /// A `unisim-…://` link (another suite app opening this one).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    /// A Universal Link.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
