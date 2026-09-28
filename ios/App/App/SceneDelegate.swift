import UIKit
import Capacitor

/// The window's owner under the **UIScene life cycle**, which iOS requires of
/// an app built against the iOS 27 SDK.
///
/// ⚠️ WHY THIS FILE EXISTS. An app built against that SDK that still uses the
/// old `UIApplicationDelegate` window life cycle — a `window` property on the
/// app delegate and no scene manifest — is **killed the moment it launches**,
/// with `UIScene life cycle is required for apps built with this SDK` in the
/// device log. There is no in-app symptom to debug: the process is gone before
/// any of our code, or the web view, runs. A build made against an older SDK
/// (Xcode 26), or run on an older OS, launches perfectly well, which is why it
/// cannot be seen until the day the Mac moves to Xcode 27.
///
/// Capacitor adopted scenes in 8.5; this app is on an earlier version, so the
/// adoption is written out by hand here, ported from Universal PDF (the suite's
/// reference copy). It mirrors Capacitor's own `SceneDelegate` template, with
/// the one difference that Capacitor 8.5's `SceneDelegateProxy` does not exist
/// here — the launch payload is forwarded to `ApplicationDelegateProxy`
/// instead, which is what `@capacitor/app`'s `getLaunchUrl()` and `appUrlOpen`
/// read on this version.
///
/// ⚠️ Under the scene life cycle iOS stops calling `AppDelegate`'s
/// `application(_:open:options:)`, `application(_:continue:…)` and the four
/// `applicationDid…`/`applicationWill…` activity methods. The first two (this
/// app's `unisim-…://` suite link and Universal Links) are re-implemented
/// below; the activity methods were Capacitor's empty template and nothing was
/// lost. **Do not put new logic in those AppDelegate methods — it will never
/// run.**
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let root = CAPBridgeViewController()
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = root
        window?.makeKeyAndVisible()

        // ⚠️ Load-bearing. A cold start that was STARTED BY a link delivers it
        // in `connectionOptions`, not through `scene(_:openURLContexts:)`.
        // Forwarding it before the bridge exists would drop it on the floor:
        // the notifications the Capacitor plugins listen for are posted to
        // nobody until `CapacitorBridge` has registered them, which happens
        // inside the view controller's `loadView()`. `loadViewIfNeeded()` makes
        // that ordering explicit rather than a side effect of
        // `makeKeyAndVisible()`.
        root.loadViewIfNeeded()

        if !connectionOptions.urlContexts.isEmpty {
            self.scene(scene, openURLContexts: connectionOptions.urlContexts)
        }
        for userActivity in connectionOptions.userActivities {
            self.scene(scene, continue: userActivity)
        }
    }

    /// A `unisim-…://` link (another suite app opening this one) handed over
    /// while the app is already running.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: context.url,
                options: Self.openURLOptions(from: context.options)
            )
        }
    }

    /// A Universal Link.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }

    /// `UIScene.OpenURLOptions` and `UIApplication.OpenURLOptionsKey` carry the
    /// same three values under different types. Capacitor only speaks the
    /// application form, so they are translated rather than dropped.
    private static func openURLOptions(
        from sceneOptions: UIScene.OpenURLOptions
    ) -> [UIApplication.OpenURLOptionsKey: Any] {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let sourceApplication = sceneOptions.sourceApplication {
            options[.sourceApplication] = sourceApplication
        }
        if let annotation = sceneOptions.annotation {
            options[.annotation] = annotation
        }
        options[.openInPlace] = sceneOptions.openInPlace
        return options
    }
}
