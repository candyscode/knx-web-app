// lib/features/rooms/presentation/rooms_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/models/apartment.dart';
import '../../../shared/providers/config_provider.dart';
import '../../../shared/widgets/glass_card.dart';
import '../../../shared/widgets/shimmer_widgets.dart';

class RoomsScreen extends ConsumerStatefulWidget {
  const RoomsScreen({super.key, required this.apartmentSlug});
  final String apartmentSlug;

  @override
  ConsumerState<RoomsScreen> createState() => _RoomsScreenState();
}

class _RoomsScreenState extends ConsumerState<RoomsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  int _selectedMode = 0; // 0 = Rooms, 1 = Global Info & Alarms

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() => setState(() => _selectedMode = _tabController.index));
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final configAsync = ref.watch(appConfigProvider);

    return Column(
      children: [
        // Mode switcher
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: _ModeSwitcher(
            tabController: _tabController,
            selected: _selectedMode,
          ),
        ),
        const SizedBox(height: 12),
        Expanded(
          child: configAsync.when(
            loading: () => const RoomsSkeleton(),
            error: (e, _) => Center(child: Text(e.toString())),
            data: (config) {
              final apartment = config.apartments
                  .cast<Apartment?>()
                  .firstWhere((a) => a?.slug == widget.apartmentSlug, orElse: () => null);
              if (apartment == null) return const SizedBox.shrink();

              return TabBarView(
                controller: _tabController,
                children: [
                  _FloorsView(apartment: apartment),
                  const _GlobalInfoView(),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class _ModeSwitcher extends StatelessWidget {
  const _ModeSwitcher({required this.tabController, required this.selected});
  final TabController tabController;
  final int selected;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: TabBar(
        controller: tabController,
        indicator: BoxDecoration(
          color: AppColors.bgElevated,
          borderRadius: BorderRadius.circular(9),
          border: Border.all(color: AppColors.border),
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        labelColor: AppColors.textPrimary,
        unselectedLabelColor: AppColors.textSecondary,
        labelStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13, fontFamily: 'Inter'),
        tabs: const [
          Tab(text: 'Rooms'),
          Tab(text: 'Global Info & Alarms'),
        ],
      ),
    );
  }
}

class _FloorsView extends StatelessWidget {
  const _FloorsView({required this.apartment});
  final Apartment apartment;

  @override
  Widget build(BuildContext context) {
    final floors = apartment.floors;
    if (floors.isEmpty) {
      return const Center(
        child: Text('No floors configured.', style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return DefaultTabController(
      length: floors.length,
      child: Column(
        children: [
          TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.start,
            labelColor: AppColors.accent,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.accent,
            dividerColor: AppColors.border,
            tabs: floors.map((f) => Tab(text: f.name)).toList(),
          ),
          Expanded(
            child: TabBarView(
              children: floors.map((floor) => _FloorRoomList(floor: floor)).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _FloorRoomList extends StatelessWidget {
  const _FloorRoomList({required this.floor});
  final Floor floor;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ...floor.rooms.map((room) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: GlassCard(
            child: Row(
              children: [
                Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    color: AppColors.accent.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(LucideIcons.home, size: 18, color: AppColors.accent),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(room.name, style: Theme.of(context).textTheme.titleMedium),
                      Text(
                        '${room.functions.length} widgets · ${room.scenes.length} scenes',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.textSecondary),
              ],
            ),
          ),
        )),
        // Add room placeholder
        GlassCard(
          onTap: () {},
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.plus, size: 16, color: AppColors.accent),
              const SizedBox(width: 8),
              Text('Add Room', style: TextStyle(color: AppColors.accent, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }
}

class _GlobalInfoView extends StatelessWidget {
  const _GlobalInfoView();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text('Central Information', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        const GlassCard(
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text('Configure central info in Setup.',
                  style: TextStyle(color: AppColors.textSecondary)),
            ),
          ),
        ),
        const SizedBox(height: 24),
        Text('Apartment Alarms', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        const GlassCard(
          child: Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Text('No alarms configured.',
                  style: TextStyle(color: AppColors.textSecondary)),
            ),
          ),
        ),
      ],
    );
  }
}
