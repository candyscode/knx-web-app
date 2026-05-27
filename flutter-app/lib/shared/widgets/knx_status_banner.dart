// lib/shared/widgets/knx_status_banner.dart
// Offline banner shown at the top when KNX is disconnected.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../core/theme/app_theme.dart';
import '../providers/config_provider.dart';

class KnxStatusBanner extends ConsumerWidget {
  const KnxStatusBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final connected = ref.watch(knxConnectedProvider);
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 350),
      child: connected
          ? const SizedBox.shrink()
          : Container(
              key: const ValueKey('offline-banner'),
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppColors.disconnected.withOpacity(0.15),
              child: Row(
                children: [
                  const Icon(LucideIcons.wifiOff,
                      size: 14, color: AppColors.disconnected),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'KNX gateway offline — showing cached data.',
                      style: TextStyle(
                        fontSize: 12, color: AppColors.disconnected,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}
