// lib/main.dart  (updated for Step 2 — adds FlutterNativeSplash)
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  // Keep native splash visible until we explicitly remove it
  final binding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: binding);

  // Load environment variables
  await dotenv.load(
    fileName: const bool.fromEnvironment('dart.vm.product')
        ? '.env.production'
        : '.env',
  );

  // Initialise local cache
  await Hive.initFlutter();
  await Hive.openBox<String>('knx_cache');

  runApp(
    const ProviderScope(
      child: KnxControlApp(),
    ),
  );
}

class KnxControlApp extends ConsumerStatefulWidget {
  const KnxControlApp({super.key});

  @override
  ConsumerState<KnxControlApp> createState() => _KnxControlAppState();
}

class _KnxControlAppState extends ConsumerState<KnxControlApp> {
  @override
  void initState() {
    super.initState();
    // Remove native splash once the first frame is drawn
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FlutterNativeSplash.remove();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'KNX Control',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark(),
      routerConfig: router,
    );
  }
}
