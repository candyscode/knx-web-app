// lib/core/theme/app_theme.dart
// ─────────────────────────────────────────────────────────────────────────────
// Design tokens mirroring the web-frontend's CSS variables.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';

abstract final class AppColors {
  // Backgrounds (from index.css --bg-*)
  static const bgBase      = Color(0xFF0F1117);
  static const bgCard      = Color(0xFF161B26);
  static const bgElevated  = Color(0xFF1E293B);

  // Borders
  static const border      = Color(0x1AFFFFFF); // rgba(255,255,255,0.1)

  // Text
  static const textPrimary   = Color(0xFFE2E8F0);
  static const textSecondary = Color(0xFF94A3B8);

  // Accent (blue)
  static const accent        = Color(0xFF3B82F6);
  static const accentDim     = Color(0x1A3B82F6); // 10% opacity

  // Status
  static const connected     = Color(0xFF22C55E);
  static const disconnected  = Color(0xFFEF4444);
  static const warning       = Color(0xFFF59E0B);

  // Widget type colours (mirror WIDGET_CATALOG in CollapsibleRoomCard.jsx)
  static const dimmerColor   = Color(0xFFF97316); // orange
  static const blindColor    = Color(0xFF818CF8); // indigo
  static const lightColor    = Color(0xFFFACC15); // yellow
  static const socketColor   = Color(0xFF34D399); // emerald
  static const lockColor     = Color(0xFFF87171); // red-400
  static const sceneColor    = Color(0xFF60A5FA); // blue-400
  static const binaryColor   = Color(0xFF2DD4BF); // teal
  static const hueColor      = Color(0xFFA78BFA); // violet
}

abstract final class AppTheme {
  static ThemeData dark() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: AppColors.bgBase,
      colorScheme: const ColorScheme.dark(
        surface:   AppColors.bgCard,
        primary:   AppColors.accent,
        secondary: AppColors.textSecondary,
        error:     AppColors.disconnected,
      ),
      fontFamily: 'Inter',
      textTheme: const TextTheme(
        // Large title (e.g. page headings)
        headlineLarge: TextStyle(
          fontSize: 24, fontWeight: FontWeight.w700,
          color: AppColors.textPrimary, letterSpacing: -0.5,
        ),
        headlineMedium: TextStyle(
          fontSize: 20, fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
        // Card titles / section labels
        titleLarge: TextStyle(
          fontSize: 16, fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
        titleMedium: TextStyle(
          fontSize: 14, fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        // Body text
        bodyLarge: TextStyle(fontSize: 15, color: AppColors.textPrimary),
        bodyMedium: TextStyle(fontSize: 13, color: AppColors.textSecondary),
        bodySmall: TextStyle(fontSize: 11, color: AppColors.textSecondary),
        // Labels
        labelLarge: TextStyle(
          fontSize: 13, fontWeight: FontWeight.w600,
          color: AppColors.textPrimary, letterSpacing: 0.1,
        ),
      ),
      dividerColor: AppColors.border,
      cardTheme: const CardThemeData(
        color: AppColors.bgCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      navigationBarTheme: const NavigationBarThemeData(
        backgroundColor: AppColors.bgElevated,
        indicatorColor: AppColors.accentDim,
        labelTextStyle: WidgetStatePropertyAll(TextStyle(
          fontSize: 12, fontWeight: FontWeight.w500, color: AppColors.textSecondary,
        )),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.bgBase,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: 'Inter', fontSize: 20,
          fontWeight: FontWeight.w700, color: AppColors.textPrimary,
        ),
        iconTheme: IconThemeData(color: AppColors.textSecondary),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          textStyle: const TextStyle(
            fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.textPrimary,
          side: const BorderSide(color: AppColors.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        ),
      ),
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: Color(0x0AFFFFFF),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(10)),
          borderSide: BorderSide(color: AppColors.accent, width: 1.5),
        ),
        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        hintStyle: TextStyle(color: AppColors.textSecondary),
        labelStyle: TextStyle(color: AppColors.textSecondary, fontSize: 12),
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.accent : AppColors.textSecondary),
        trackColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? AppColors.accentDim : AppColors.border),
      ),
      sliderTheme: const SliderThemeData(
        activeTrackColor: AppColors.accent,
        inactiveTrackColor: AppColors.border,
        thumbColor: AppColors.accent,
        overlayColor: AppColors.accentDim,
      ),
    );
  }
}
