// lib/core/router/app_router.dart
// ─────────────────────────────────────────────────────────────────────────────
// go_router setup.  Mirrors the web app URL scheme:
//   /:apartmentSlug              → Dashboard
//   /:apartmentSlug/rooms        → Rooms
//   /:apartmentSlug/connections  → Setup
//   /:apartmentSlug/automation   → Automation
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

// Screens (will be implemented in later steps — stubs for now)
import '../../features/dashboard/presentation/dashboard_screen.dart';
import '../../features/rooms/presentation/rooms_screen.dart';
import '../../features/setup/presentation/setup_screen.dart';
import '../../features/automation/presentation/automation_screen.dart';
import '../../shared/widgets/main_shell.dart';

part 'app_router.g.dart';

@riverpod
GoRouter appRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          // Default redirect — handled by MainShell once config is loaded
          GoRoute(
            path: '/',
            redirect: (_, __) => null, // shell decides
          ),
          GoRoute(
            path: '/:apartment',
            builder: (context, state) => DashboardScreen(
              apartmentSlug: state.pathParameters['apartment']!,
            ),
            routes: [
              GoRoute(
                path: 'rooms',
                builder: (context, state) => RoomsScreen(
                  apartmentSlug: state.pathParameters['apartment']!,
                ),
              ),
              GoRoute(
                path: 'connections',
                builder: (context, state) => SetupScreen(
                  apartmentSlug: state.pathParameters['apartment']!,
                ),
              ),
              GoRoute(
                path: 'automation',
                builder: (context, state) => AutomationScreen(
                  apartmentSlug: state.pathParameters['apartment']!,
                ),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
