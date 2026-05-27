import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../core/api/api_client.dart';
import '../models/apartment.dart';

part 'config_provider.g.dart';

class AppConfig {
  const AppConfig({required this.apartments, this.building});
  final List<Apartment> apartments;
  final Map<String, dynamic>? building;
}

@riverpod
Future<AppConfig> appConfig(Ref ref) async {
  final dio = ref.watch(apiClientProvider);
  final box = Hive.box<String>('knx_cache');

  try {
    final response = await dio.get('/api/config');
    final data = response.data as Map<String, dynamic>;
    
    // Cache the response
    await box.put('app_config', jsonEncode(data));
    
    return _parseConfig(data);
  } catch (e) {
    // Fallback to cache
    final cached = box.get('app_config');
    if (cached != null) {
      final data = jsonDecode(cached) as Map<String, dynamic>;
      return _parseConfig(data);
    }
    rethrow;
  }
}

AppConfig _parseConfig(Map<String, dynamic> data) {
  final aptsRaw = data['apartments'] as List<dynamic>? ?? [];
  final apartments = aptsRaw
      .map((e) => Apartment.fromJson(e as Map<String, dynamic>))
      .toList();
  return AppConfig(apartments: apartments, building: data['building']);
}

// ── Selected apartment slug (StateProvider for simple string state) ────────────
final selectedApartmentSlugProvider = StateProvider<String?>((ref) => null);

// ── KNX connection status ─────────────────────────────────────────────────────
final knxConnectedProvider = StateProvider<bool>((ref) => false);
