// lib/features/setup/presentation/setup_screen.dart
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../core/theme/app_theme.dart';
import '../../../shared/widgets/glass_card.dart';
import '../../../shared/widgets/shimmer_widgets.dart';

class SetupScreen extends StatelessWidget {
  const SetupScreen({super.key, required this.apartmentSlug});
  final String apartmentSlug;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SetupSection(
          title: 'Current Apartment',
          subtitle: 'Gateway, ETS XML, Hue Bridge',
          icon: LucideIcons.building2,
          color: AppColors.accent,
          children: [
            _SettingsTile(icon: LucideIcons.network, label: 'KNX Gateway',    value: 'Not configured'),
            _SettingsTile(icon: LucideIcons.fileCode2, label: 'ETS XML',       value: 'No file imported'),
            _SettingsTile(icon: LucideIcons.lightbulb, label: 'Philips Hue',  value: 'Not paired'),
          ],
        ),
        const SizedBox(height: 16),
        _SetupSection(
          title: 'Main Line Setup',
          subtitle: 'Shared gateway access, Sun Trigger',
          icon: LucideIcons.gitBranch,
          color: AppColors.dimmerColor,
          children: [
            _SettingsTile(icon: LucideIcons.share2,  label: 'Main Line Access', value: 'Not set'),
            _SettingsTile(icon: LucideIcons.sun,     label: 'Sun Trigger GA',   value: 'Not configured'),
            _SettingsTile(icon: LucideIcons.fileCode2, label: 'Main Line ETS',  value: 'No file'),
          ],
        ),
        const SizedBox(height: 16),
        _SetupSection(
          title: 'Manage Apartments',
          subtitle: 'Add, remove, export, import',
          icon: LucideIcons.building,
          color: AppColors.binaryColor,
          children: [
            _SettingsTile(icon: LucideIcons.plus,        label: 'Add Apartment',   value: ''),
            _SettingsTile(icon: LucideIcons.download,    label: 'Export Config',   value: ''),
            _SettingsTile(icon: LucideIcons.upload,      label: 'Import Config',   value: ''),
          ],
        ),
        const SizedBox(height: 16),
        _SetupSection(
          title: 'Configuration Protection',
          subtitle: 'Password protect Rooms, Setup & Automation',
          icon: LucideIcons.shield,
          color: AppColors.lockColor,
          children: [
            _SettingsTile(icon: LucideIcons.lock, label: 'Set Password', value: 'Disabled'),
          ],
        ),
      ],
    );
  }
}

class _SetupSection extends StatelessWidget {
  const _SetupSection({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    required this.children,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SectionCard(
      title: title,
      subtitle: subtitle,
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 18),
      ),
      child: Column(children: children),
    );
  }
}

class _SettingsTile extends StatelessWidget {
  const _SettingsTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 2),
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon, size: 18, color: AppColors.textSecondary),
        title: Text(label, style: Theme.of(context).textTheme.titleMedium),
        trailing: value.isEmpty
          ? const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.textSecondary)
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(value, style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(width: 4),
                const Icon(LucideIcons.chevronRight, size: 16, color: AppColors.textSecondary),
              ],
            ),
        onTap: () {},
      ),
    );
  }
}
