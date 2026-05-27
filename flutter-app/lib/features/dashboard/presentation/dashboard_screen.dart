// lib/features/dashboard/presentation/dashboard_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/models/apartment.dart';
import '../../../shared/providers/config_provider.dart';
import '../../../shared/providers/device_states_provider.dart';
import '../../../shared/widgets/glass_card.dart';
import '../../../shared/widgets/shimmer_widgets.dart';
import 'widgets/room_card.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key, required this.apartmentSlug});
  final String apartmentSlug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final configAsync = ref.watch(appConfigProvider);

    return configAsync.when(
      loading: () => const DashboardSkeleton(),
      error: (e, _) => _ErrorView(message: e.toString()),
      data: (config) {
        final apartment = config.apartments
            .cast<Apartment?>()
            .firstWhere((a) => a?.slug == apartmentSlug, orElse: () => null);

        if (apartment == null) {
          return const _ErrorView(message: 'Apartment not found.');
        }

        return _DashboardContent(apartment: apartment);
      },
    );
  }
}

class _DashboardContent extends StatelessWidget {
  const _DashboardContent({required this.apartment});
  final Apartment apartment;

  @override
  Widget build(BuildContext context) {
    // Collect all floors (private + shared)
    final allFloors = apartment.floors;

    return DefaultTabController(
      length: allFloors.length,
      child: NestedScrollView(
        headerSliverBuilder: (context, _) => [
          // Central info strip (placeholder for Step 3 real data)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _CentralInfoStrip(),
            ),
          ),
          // Alarms (placeholder)
          SliverToBoxAdapter(child: SizedBox(height: 12)),
          // Floor tabs
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                labelColor: AppColors.accent,
                unselectedLabelColor: AppColors.textSecondary,
                indicatorColor: AppColors.accent,
                indicatorWeight: 2,
                dividerColor: Colors.transparent,
                tabs: allFloors
                    .map((f) => Tab(text: f.name))
                    .toList(),
              ),
            ),
          ),
        ],
        body: TabBarView(
          children: allFloors
              .map((floor) => _FloorRoomsView(floor: floor))
              .toList(),
        ),
      ),
    );
  }
}

class _FloorRoomsView extends ConsumerWidget {
  const _FloorRoomsView({required this.floor});
  final Floor floor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (floor.rooms.isEmpty) {
      return Center(
        child: Text(
          'No rooms on ${floor.name}',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      );
    }

    final deviceStates = ref.watch(deviceStatesProvider);

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: floor.rooms.length,
      separatorBuilder: (_, __) => const SizedBox(height: 12),
      itemBuilder: (context, i) => RoomCard(
        room: floor.rooms[i],
        deviceStates: deviceStates,
        onAction: (groupAddress, type, value) {
          ref.read(deviceStatesProvider.notifier).updateState(groupAddress, type, value);
        },
        animationDelay: Duration(milliseconds: i * 60),
      ),
    );
  }
}

class _CentralInfoStrip extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    // Placeholder — real data wired in Step 3
    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          _InfoItem(
            icon: LucideIcons.thermometer,
            label: 'Outside Temp',
            value: '--°',
            color: AppColors.dimmerColor,
          ),
          const SizedBox(width: 24),
          _InfoItem(
            icon: LucideIcons.wind,
            label: 'Wind',
            value: '-- m/s',
            color: AppColors.accent,
          ),
        ],
      ),
    );
  }
}

class _InfoItem extends StatelessWidget {
  const _InfoItem({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        const SizedBox(width: 10),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                  letterSpacing: 0.5,
                )),
            Text(value,
                style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary,
                )),
          ],
        ),
      ],
    );
  }
}

// ── SliverPersistentHeaderDelegate for the TabBar ─────────────────────────────

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  const _TabBarDelegate(this.tabBar);
  final TabBar tabBar;

  @override double get minExtent => tabBar.preferredSize.height + 1;
  @override double get maxExtent => tabBar.preferredSize.height + 1;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: AppColors.bgBase,
      child: tabBar,
    );
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => tabBar != oldDelegate.tabBar;
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(LucideIcons.alertCircle, color: AppColors.disconnected, size: 48),
            const SizedBox(height: 16),
            Text(message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium),
          ],
        ),
      ),
    );
  }
}
