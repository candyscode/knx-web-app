// lib/features/dashboard/presentation/widgets/widget_tile.dart
// Individual interactive widget tile (switch, dimmer, blind, lock, etc.)
// Mirrors the web Widget Catalog tiles rendered on the room card.

import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../../shared/models/apartment.dart';

class WidgetTile extends StatelessWidget {
  const WidgetTile({
    super.key,
    required this.function,
    required this.currentValue,
    required this.onAction,
  });

  final KnxFunction function;
  final dynamic currentValue;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    switch (function.type) {
      case 'dimmer':          return _DimmerTile(fn: function, value: currentValue, onAction: onAction);
      case 'percentage':      return _PercentageTile(fn: function, value: currentValue, onAction: onAction);
      case 'binary_selector': return _BinarySelectorTile(fn: function, value: currentValue, onAction: onAction);
      case 'scene':           return _SceneButtonTile(fn: function, onAction: onAction);
      default: /* switch, light, socket, lock */
        return _BoolTile(fn: function, value: currentValue, onAction: onAction);
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

(IconData, Color) _iconAndColor(String type) {
  switch (type) {
    case 'dimmer':          return (LucideIcons.slidersHorizontal, AppColors.dimmerColor);
    case 'percentage':      return (LucideIcons.blinds,           AppColors.blindColor);
    case 'light':           return (LucideIcons.lightbulb,        AppColors.lightColor);
    case 'socket':          return (LucideIcons.plug,             AppColors.socketColor);
    case 'lock':            return (LucideIcons.lock,             AppColors.lockColor);
    case 'scene':           return (LucideIcons.play,             AppColors.sceneColor);
    case 'binary_selector': return (LucideIcons.arrowLeftRight,  AppColors.binaryColor);
    default:                return (LucideIcons.power,            AppColors.textSecondary);
  }
}

bool _isTruthy(dynamic value) {
  if (value == null) return false;
  if (value is bool) return value;
  if (value is num)  return value != 0;
  if (value is String) return value == '1' || value.toLowerCase() == 'true';
  return false;
}

// ── Bool tile (switch / light / socket / lock) ────────────────────────────────

class _BoolTile extends StatelessWidget {
  const _BoolTile({required this.fn, required this.value, required this.onAction});
  final KnxFunction fn;
  final dynamic value;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    final on = fn.inverted ? !_isTruthy(value) : _isTruthy(value);
    final (icon, color) = _iconAndColor(fn.type);
    final activeColor = on ? color : AppColors.textSecondary;

    return GestureDetector(
      onTap: () => onAction(!on),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 80, height: 80,
        decoration: BoxDecoration(
          color: on ? color.withOpacity(0.12) : AppColors.bgElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: on ? color.withOpacity(0.4) : AppColors.border,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: activeColor, size: 24),
            const SizedBox(height: 5),
            Text(
              fn.name,
              style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w600,
                color: activeColor,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

// ── Dimmer tile ───────────────────────────────────────────────────────────────

class _DimmerTile extends StatelessWidget {
  const _DimmerTile({required this.fn, required this.value, required this.onAction});
  final KnxFunction fn;
  final dynamic value;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    final pct = (value is num ? (value as num).toDouble() : 0.0).clamp(0.0, 100.0);
    final on = pct > 0;

    return GestureDetector(
      onTap: () => onAction(on ? 0 : 100),
      onLongPress: () => _showSlider(context, pct),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: 80, height: 80,
        decoration: BoxDecoration(
          color: on ? AppColors.dimmerColor.withOpacity(0.12) : AppColors.bgElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: on ? AppColors.dimmerColor.withOpacity(0.4) : AppColors.border,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.slidersHorizontal,
                color: on ? AppColors.dimmerColor : AppColors.textSecondary,
                size: 22),
            const SizedBox(height: 4),
            Text(
              '${pct.toInt()}%',
              style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700,
                color: on ? AppColors.dimmerColor : AppColors.textSecondary,
              ),
            ),
            Text(fn.name,
                style: const TextStyle(fontSize: 9, color: AppColors.textSecondary),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  void _showSlider(BuildContext context, double current) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _SliderSheet(label: fn.name, initial: current, onChanged: onAction),
    );
  }
}

// ── Percentage (blind) tile ───────────────────────────────────────────────────

class _PercentageTile extends StatelessWidget {
  const _PercentageTile({required this.fn, required this.value, required this.onAction});
  final KnxFunction fn;
  final dynamic value;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    final pct = (value is num ? (value as num).toDouble() : 0.0).clamp(0.0, 100.0);

    return GestureDetector(
      onLongPress: () => _showSlider(context, pct),
      child: Container(
        width: 80, height: 80,
        decoration: BoxDecoration(
          color: AppColors.bgElevated,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 34, height: 34,
                  child: CircularProgressIndicator(
                    value: pct / 100,
                    strokeWidth: 3,
                    backgroundColor: AppColors.border,
                    valueColor: const AlwaysStoppedAnimation(AppColors.blindColor),
                  ),
                ),
                Text('${pct.toInt()}',
                    style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700,
                      color: AppColors.blindColor,
                    )),
              ],
            ),
            const SizedBox(height: 4),
            Text(fn.name,
                style: const TextStyle(fontSize: 9, color: AppColors.textSecondary),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }

  void _showSlider(BuildContext context, double current) {
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.bgElevated,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _SliderSheet(label: fn.name, initial: current, onChanged: onAction),
    );
  }
}

// ── Binary Mode Selector tile ─────────────────────────────────────────────────

class _BinarySelectorTile extends StatelessWidget {
  const _BinarySelectorTile({required this.fn, required this.value, required this.onAction});
  final KnxFunction fn;
  final dynamic value;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    final isOne = _isTruthy(value);
    final label = isOne
        ? (fn.modeOnLabel  ?? 'On')
        : (fn.modeOffLabel ?? 'Off');

    return GestureDetector(
      onTap: () => onAction(!isOne),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        constraints: const BoxConstraints(minWidth: 80),
        decoration: BoxDecoration(
          color: AppColors.binaryColor.withOpacity(isOne ? 0.15 : 0.05),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: AppColors.binaryColor.withOpacity(isOne ? 0.5 : 0.2),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.arrowLeftRight,
                color: AppColors.binaryColor, size: 20),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700,
                color: AppColors.binaryColor,
              ),
            ),
            Text(fn.name,
                style: const TextStyle(fontSize: 9, color: AppColors.textSecondary),
                maxLines: 1, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ── Scene button tile ─────────────────────────────────────────────────────────

class _SceneButtonTile extends StatelessWidget {
  const _SceneButtonTile({required this.fn, required this.onAction});
  final KnxFunction fn;
  final ValueChanged<dynamic> onAction;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => onAction(true),
      child: Container(
        width: 80, height: 80,
        decoration: BoxDecoration(
          color: AppColors.sceneColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.sceneColor.withOpacity(0.3)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(LucideIcons.play, color: AppColors.sceneColor, size: 22),
            const SizedBox(height: 4),
            Text(fn.name,
                style: const TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w600,
                  color: AppColors.sceneColor,
                ),
                textAlign: TextAlign.center,
                maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
        ),
      ),
    );
  }
}

// ── Shared slider bottom sheet ────────────────────────────────────────────────

class _SliderSheet extends StatefulWidget {
  const _SliderSheet({required this.label, required this.initial, required this.onChanged});
  final String label;
  final double initial;
  final ValueChanged<dynamic> onChanged;

  @override
  State<_SliderSheet> createState() => _SliderSheetState();
}

class _SliderSheetState extends State<_SliderSheet> {
  late double _value;

  @override
  void initState() { super.initState(); _value = widget.initial; }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Handle
          Container(
            width: 40, height: 4,
            decoration: BoxDecoration(
              color: AppColors.border,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(widget.label, style: Theme.of(context).textTheme.titleMedium),
              Text('${_value.toInt()}%',
                  style: const TextStyle(
                    fontSize: 22, fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
                  )),
            ],
          ),
          const SizedBox(height: 12),
          Slider(
            value: _value,
            min: 0, max: 100, divisions: 20,
            onChanged: (v) => setState(() => _value = v),
            onChangeEnd: (v) => widget.onChanged(v.toInt()),
          ),
        ],
      ),
    );
  }
}
