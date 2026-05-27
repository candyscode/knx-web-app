// lib/features/automation/presentation/automation_screen.dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/glass_card.dart';
import '../../../shared/widgets/shimmer_widgets.dart';

class AutomationScreen extends StatelessWidget {
  const AutomationScreen({super.key, required this.apartmentSlug});
  final String apartmentSlug;

  @override
  Widget build(BuildContext context) {
    // Placeholder list — real data wired in Step 3
    return Scaffold(
      backgroundColor: AppColors.bgBase,
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Routines', style: Theme.of(context).textTheme.headlineMedium),
              ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(LucideIcons.plus, size: 16),
                label: const Text('New Routine'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Empty state
          GlassCard(
            child: Column(
              children: [
                const SizedBox(height: 24),
                const Icon(LucideIcons.bot, size: 48, color: AppColors.textSecondary),
                const SizedBox(height: 16),
                Text(
                  'No routines yet.',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Create a routine to automate your home.',
                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ],
      ),
      // FAB for quick access
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        icon: const Icon(LucideIcons.plus),
        label: const Text('New Routine', style: TextStyle(fontWeight: FontWeight.w600)),
      ),
    );
  }
}
