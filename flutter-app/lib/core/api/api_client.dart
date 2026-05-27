// lib/core/api/api_client.dart
// ─────────────────────────────────────────────────────────────────────────────
// Singleton Dio client + environment-aware base URL.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'api_client.g.dart';

@riverpod
Dio apiClient(Ref ref) {
  final baseUrl = dotenv.env['BACKEND_URL'] ?? 'http://localhost:3001';

  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 15),
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  ));

  // Logging in debug mode only
  assert(() {
    dio.interceptors.add(LogInterceptor(
      requestBody: true,
      responseBody: true,
      logPrint: (o) => debugPrint('[DIO] $o'),
    ));
    return true;
  }());

  return dio;
}

/// Base URL (for WebSocket) exposed separately
String get wsBaseUrl => dotenv.env['BACKEND_WS_URL'] ?? 'ws://localhost:3001';
