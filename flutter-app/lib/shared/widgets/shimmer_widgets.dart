// lib/shared/widgets/shimmer_widgets.dart
// Reusable shimmer skeleton loaders used while data is being fetched.

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import '../../core/theme/app_theme.dart';

// ── Base shimmer container ────────────────────────────────────────────────────

class ShimmerBox extends StatelessWidget {
  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 10,
  });

  final double width;
  final double height;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}

// ── Dashboard skeleton ────────────────────────────────────────────────────────

class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Central info strip
          const _CentralInfoSkeleton(),
          const SizedBox(height: 24),
          // Floor tabs
          Row(
            children: List.generate(3, (i) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ShimmerBox(width: 80 + i * 10, height: 36, borderRadius: 20),
            )),
          ),
          const SizedBox(height: 16),
          // Room cards grid
          ...List.generate(3, (_) => const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: _RoomCardSkeleton(),
          )),
        ],
      ),
    );
  }
}

class _CentralInfoSkeleton extends StatelessWidget {
  const _CentralInfoSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: List.generate(3, (i) => Expanded(
          child: Padding(
            padding: EdgeInsets.only(right: i < 2 ? 12 : 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const ShimmerBox(width: 60, height: 10),
                const SizedBox(height: 8),
                const ShimmerBox(width: 80, height: 22),
              ],
            ),
          ),
        )),
      ),
    );
  }
}

class _RoomCardSkeleton extends StatelessWidget {
  const _RoomCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Room header
          Row(
            children: const [
              ShimmerBox(width: 40, height: 40, borderRadius: 12),
              SizedBox(width: 12),
              ShimmerBox(width: 120, height: 18),
            ],
          ),
          const SizedBox(height: 16),
          // Widget chips row
          Row(
            children: List.generate(3, (i) => Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ShimmerBox(width: 72, height: 72, borderRadius: 12),
            )),
          ),
        ],
      ),
    );
  }
}

// ── Rooms skeleton ────────────────────────────────────────────────────────────

class RoomsSkeleton extends StatelessWidget {
  const RoomsSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Section header
        const ShimmerBox(width: 140, height: 22),
        const SizedBox(height: 16),
        ...List.generate(4, (_) => const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: _ListItemSkeleton(),
        )),
      ],
    );
  }
}

class _ListItemSkeleton extends StatelessWidget {
  const _ListItemSkeleton();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: const [
          ShimmerBox(width: 36, height: 36, borderRadius: 10),
          SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ShimmerBox(width: 100, height: 14),
              SizedBox(height: 6),
              ShimmerBox(width: 60, height: 10),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Generic list skeleton (reused by Setup + Automation) ─────────────────────

class GenericListSkeleton extends StatelessWidget {
  const GenericListSkeleton({super.key, this.itemCount = 4});
  final int itemCount;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: List.generate(itemCount, (_) => const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: _ListItemSkeleton(),
      )),
    );
  }
}
