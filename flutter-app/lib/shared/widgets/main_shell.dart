// lib/shared/widgets/main_shell.dart  (Step 2 — refined)
// Persistent App Shell: apartment picker in AppBar + bottom NavigationBar.
// Uses shimmer while config is loading. Handles no-apartment state gracefully.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shimmer/shimmer.dart';

import '../../core/theme/app_theme.dart';
import '../providers/config_provider.dart';

class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.child});
  final Widget child;

  int _locationToIndex(String location) {
    if (location.contains('/rooms'))       return 1;
    if (location.contains('/connections')) return 2;
    if (location.contains('/automation'))  return 3;
    return 0;
  }

  void _onNav(BuildContext context, WidgetRef ref, int index) {
    final slug = ref.read(selectedApartmentSlugProvider) ?? '';
    if (slug.isEmpty) return;
    switch (index) {
      case 0: context.go('/$slug');
      case 1: context.go('/$slug/rooms');
      case 2: context.go('/$slug/connections');
      case 3: context.go('/$slug/automation');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync  = ref.watch(appConfigProvider);
    final selectedSlug = ref.watch(selectedApartmentSlugProvider);
    final location     = GoRouterState.of(context).uri.toString();
    final navIndex     = _locationToIndex(location);

    // Auto-select first apartment after config loads
    ref.listen(appConfigProvider, (_, next) {
      next.whenData((config) {
        if (config.apartments.isNotEmpty &&
            ref.read(selectedApartmentSlugProvider) == null) {
          ref.read(selectedApartmentSlugProvider.notifier).state =
              config.apartments.first.slug;
        }
      });
    });

    return Scaffold(
      backgroundColor: AppColors.bgBase,

      // ── Top AppBar ──────────────────────────────────────────────────────
      appBar: AppBar(
        backgroundColor: AppColors.bgBase,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        titleSpacing: 16,
        title: configAsync.when(
          loading: () => _ShimmerPill(width: 150),
          error: (_, __) => const SizedBox.shrink(),
          data: (config) {
            if (config.apartments.isEmpty) {
              return Text('KNX Control',
                  style: Theme.of(context).appBarTheme.titleTextStyle);
            }
            final current = selectedSlug ?? config.apartments.first.slug;
            return _ApartmentDropdown(
              apartments: config.apartments.map((a) => (slug: a.slug, name: a.name)).toList(),
              selected: current,
              onChanged: (slug) {
                ref.read(selectedApartmentSlugProvider.notifier).state = slug;
                context.go('/$slug');
              },
            );
          },
        ),
        actions: [
          const _ConnectionDot(),
          const SizedBox(width: 16),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Container(height: 1, color: AppColors.border),
        ),
      ),

      // ── Page body ───────────────────────────────────────────────────────
      body: child,

      // ── Bottom nav ──────────────────────────────────────────────────────
      bottomNavigationBar: _BottomNav(
        selectedIndex: navIndex,
        onTap: (i) => _onNav(context, ref, i),
      ),
    );
  }
}

// ── Apartment dropdown ──────────────────────────────────────────────────────

class _ApartmentDropdown extends StatelessWidget {
  const _ApartmentDropdown({
    required this.apartments,
    required this.selected,
    required this.onChanged,
  });

  final List<({String slug, String name})> apartments;
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return DropdownButtonHideUnderline(
      child: DropdownButton<String>(
        value: apartments.any((a) => a.slug == selected) ? selected : apartments.first.slug,
        isDense: true,
        dropdownColor: AppColors.bgElevated,
        borderRadius: BorderRadius.circular(12),
        style: const TextStyle(
          fontFamily: 'Inter', fontSize: 17,
          fontWeight: FontWeight.w700, color: AppColors.textPrimary,
        ),
        icon: const Icon(LucideIcons.chevronsUpDown,
            size: 15, color: AppColors.textSecondary),
        items: apartments.map((a) => DropdownMenuItem(
          value: a.slug,
          child: Text(a.name),
        )).toList(),
        onChanged: (v) { if (v != null) onChanged(v); },
      ),
    );
  }
}

// ── Compact connection dot (WiFi icon + status dot) ──────────────────────────

class _ConnectionDot extends ConsumerWidget {
  const _ConnectionDot();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connected = ref.watch(knxConnectedProvider);
    final color = connected ? AppColors.connected : AppColors.disconnected;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          connected ? LucideIcons.wifi : LucideIcons.wifiOff,
          size: 17, color: color,
        ),
        const SizedBox(width: 3),
        AnimatedContainer(
          duration: const Duration(milliseconds: 400),
          width: 7, height: 7,
          decoration: BoxDecoration(
            shape: BoxShape.circle, color: color,
            boxShadow: connected
              ? [BoxShadow(color: color.withOpacity(0.55), blurRadius: 5)]
              : null,
          ),
        ),
      ],
    );
  }
}

// ── Bottom navigation bar ─────────────────────────────────────────────────────

class _BottomNav extends StatelessWidget {
  const _BottomNav({required this.selectedIndex, required this.onTap});
  final int selectedIndex;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    return NavigationBar(
      selectedIndex: selectedIndex,
      onDestinationSelected: onTap,
      backgroundColor: AppColors.bgElevated,
      surfaceTintColor: Colors.transparent,
      indicatorColor: AppColors.accentDim,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      destinations: const [
        NavigationDestination(
          icon:         Icon(LucideIcons.layoutDashboard, size: 22),
          selectedIcon: Icon(LucideIcons.layoutDashboard, size: 22, color: AppColors.accent),
          label: 'Dashboard',
        ),
        NavigationDestination(
          icon:         Icon(LucideIcons.settings, size: 22),
          selectedIcon: Icon(LucideIcons.settings, size: 22, color: AppColors.accent),
          label: 'Rooms',
        ),
        NavigationDestination(
          icon:         Icon(LucideIcons.plug, size: 22),
          selectedIcon: Icon(LucideIcons.plug, size: 22, color: AppColors.accent),
          label: 'Setup',
        ),
        NavigationDestination(
          icon:         Icon(LucideIcons.bot, size: 22),
          selectedIcon: Icon(LucideIcons.bot, size: 22, color: AppColors.accent),
          label: 'Automation',
        ),
      ],
    );
  }
}

// ── Shimmer loading pill for the dropdown skeleton ────────────────────────────

class _ShimmerPill extends StatelessWidget {
  const _ShimmerPill({required this.width});
  final double width;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Container(
        width: width, height: 22,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(6),
        ),
      ),
    );
  }
}
