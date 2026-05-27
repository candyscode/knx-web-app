// lib/features/dashboard/presentation/widgets/room_card.dart
// Interactive room card — mirrors CollapsibleRoomCard.jsx from the web app.
// Displays the room's widgets (functions) and scenes.

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/models/apartment.dart';
import '../../../../shared/widgets/glass_card.dart';
import 'widget_tile.dart';

class RoomCard extends StatefulWidget {
  const RoomCard({
    super.key,
    required this.room,
    required this.deviceStates,
    required this.onAction,
    this.animationDelay = Duration.zero,
  });

  final Room room;
  /// Map<groupAddress, dynamic value>
  final Map<String, dynamic> deviceStates;
  final void Function(String groupAddress, String type, dynamic value) onAction;
  final Duration animationDelay;

  @override
  State<RoomCard> createState() => _RoomCardState();
}

class _RoomCardState extends State<RoomCard> {
  bool _expanded = true;

  IconData _roomIcon() {
    switch (widget.room.icon) {
      case 'lightbulb': return LucideIcons.lightbulb;
      case 'lock':      return LucideIcons.lock;
      default:          return LucideIcons.home;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasTemperature = widget.room.temperatureGroupAddress != null;
    final tempValue = hasTemperature
        ? widget.deviceStates[widget.room.temperatureGroupAddress]
        : null;

    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Room header ──────────────────────────────────────────────
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            onTap: () => setState(() => _expanded = !_expanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
              child: Row(
                children: [
                  // Icon
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: AppColors.accent.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(_roomIcon(), size: 20, color: AppColors.accent),
                  ),
                  const SizedBox(width: 12),
                  // Name
                  Expanded(
                    child: Text(
                      widget.room.name,
                      style: theme.textTheme.titleLarge,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  // Temperature badge
                  if (hasTemperature && tempValue != null) ...[
                    const SizedBox(width: 8),
                    _TemperatureBadge(value: tempValue as double),
                  ],
                  // Expand chevron
                  const SizedBox(width: 8),
                  AnimatedRotation(
                    turns: _expanded ? 0 : -0.25,
                    duration: const Duration(milliseconds: 200),
                    child: const Icon(
                      LucideIcons.chevronDown,
                      size: 18,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Expandable body ──────────────────────────────────────────
          AnimatedCrossFade(
            firstChild: _RoomBody(
              room: widget.room,
              deviceStates: widget.deviceStates,
              onAction: widget.onAction,
            ),
            secondChild: const SizedBox.shrink(),
            crossFadeState: _expanded
                ? CrossFadeState.showFirst
                : CrossFadeState.showSecond,
            duration: const Duration(milliseconds: 220),
          ),
        ],
      ),
    ).animate(delay: widget.animationDelay).fadeIn(duration: 300.ms).slideY(
          begin: 0.04, end: 0, duration: 300.ms, curve: Curves.easeOut);
  }
}

// ── Room body (scenes + function widgets) ─────────────────────────────────────

class _RoomBody extends StatelessWidget {
  const _RoomBody({
    required this.room,
    required this.deviceStates,
    required this.onAction,
  });

  final Room room;
  final Map<String, dynamic> deviceStates;
  final void Function(String, String, dynamic) onAction;

  @override
  Widget build(BuildContext context) {
    final hasScenes    = room.scenes.isNotEmpty;
    final hasFunctions = room.functions.isNotEmpty;

    if (!hasScenes && !hasFunctions) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Text('No widgets added yet.',
            style: Theme.of(context).textTheme.bodyMedium),
      );
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Scenes row
          if (hasScenes) ...[
            _SectionLabel('Scenes'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: room.scenes
                  .map((s) => _SceneChip(
                        scene: s,
                        groupAddress: room.sceneGroupAddress ?? '',
                        onTap: () => onAction(
                          room.sceneGroupAddress ?? '',
                          'scene',
                          s.number,
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
          ],
          // Function widgets grid
          if (hasFunctions) ...[
            _SectionLabel('Functions'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: room.functions
                  .map((fn) => WidgetTile(
                        function: fn,
                        currentValue: deviceStates[fn.groupAddress],
                        onAction: (v) => onAction(fn.groupAddress, fn.type, v),
                      ))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _SectionLabel(String label) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 2),
    child: Text(label,
      style: const TextStyle(
        fontSize: 10, fontWeight: FontWeight.w700,
        color: AppColors.textSecondary,
        letterSpacing: 0.8,
      )),
  );
}

// ── Scene chip ────────────────────────────────────────────────────────────────

class _SceneChip extends StatelessWidget {
  const _SceneChip({
    required this.scene,
    required this.groupAddress,
    required this.onTap,
  });

  final KnxScene scene;
  final String groupAddress;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: AppColors.sceneColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.sceneColor.withOpacity(0.25)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(LucideIcons.play,
                  size: 13, color: AppColors.sceneColor),
              const SizedBox(width: 6),
              Text(scene.name,
                  style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600,
                    color: AppColors.sceneColor,
                  )),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Temperature badge ─────────────────────────────────────────────────────────

class _TemperatureBadge extends StatelessWidget {
  const _TemperatureBadge({required this.value});
  final double value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.accent.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.accent.withOpacity(0.2)),
      ),
      child: Text(
        '${value.toStringAsFixed(1)}°',
        style: const TextStyle(
          fontSize: 12, fontWeight: FontWeight.w700,
          color: AppColors.accent,
        ),
      ),
    );
  }
}
