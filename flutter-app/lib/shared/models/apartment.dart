// lib/shared/models/apartment.dart
// Domain model mirroring the backend config structure

import 'package:equatable/equatable.dart';

class Apartment extends Equatable {
  const Apartment({
    required this.id,
    required this.name,
    required this.slug,
    required this.knxIp,
    required this.knxPort,
    required this.floors,
    required this.alarms,
  });

  final String id;
  final String name;
  final String slug;
  final String knxIp;
  final int knxPort;
  final List<Floor> floors;
  final List<dynamic> alarms;

  factory Apartment.fromJson(Map<String, dynamic> json) => Apartment(
    id:       json['id'] as String,
    name:     json['name'] as String,
    slug:     json['slug'] as String,
    knxIp:   json['knxIp'] as String? ?? '',
    knxPort: json['knxPort'] as int? ?? 3671,
    floors:  (json['floors'] as List<dynamic>? ?? [])
                .map((f) => Floor.fromJson(f as Map<String, dynamic>))
                .toList(),
    alarms:  json['alarms'] as List<dynamic>? ?? [],
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'name': name, 'slug': slug,
    'knxIp': knxIp, 'knxPort': knxPort,
    'floors': floors.map((f) => f.toJson()).toList(),
    'alarms': alarms,
  };

  @override
  List<Object?> get props => [id, slug];
}

class Floor extends Equatable {
  const Floor({required this.id, required this.name, required this.rooms});

  final String id;
  final String name;
  final List<Room> rooms;

  factory Floor.fromJson(Map<String, dynamic> json) => Floor(
    id:    json['id'] as String,
    name:  json['name'] as String,
    rooms: (json['rooms'] as List<dynamic>? ?? [])
              .map((r) => Room.fromJson(r as Map<String, dynamic>))
              .toList(),
  );

  Map<String, dynamic> toJson() =>
    {'id': id, 'name': name, 'rooms': rooms.map((r) => r.toJson()).toList()};

  @override
  List<Object?> get props => [id];
}

class Room extends Equatable {
  const Room({
    required this.id,
    required this.name,
    required this.scenes,
    required this.functions,
    this.temperatureGroupAddress,
    this.sceneGroupAddress,
    this.icon,
  });

  final String id;
  final String name;
  final List<KnxScene> scenes;
  final List<KnxFunction> functions;
  final String? temperatureGroupAddress;
  final String? sceneGroupAddress;
  final String? icon;

  factory Room.fromJson(Map<String, dynamic> json) => Room(
    id:                      json['id'] as String,
    name:                    json['name'] as String,
    scenes:                  (json['scenes'] as List<dynamic>? ?? [])
                               .map((s) => KnxScene.fromJson(s as Map<String, dynamic>))
                               .toList(),
    functions:               (json['functions'] as List<dynamic>? ?? [])
                               .map((f) => KnxFunction.fromJson(f as Map<String, dynamic>))
                               .toList(),
    temperatureGroupAddress: json['temperatureGroupAddress'] as String?,
    sceneGroupAddress:       json['sceneGroupAddress'] as String?,
    icon:                    json['icon'] as String?,
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'name': name,
    'scenes': scenes.map((s) => s.toJson()).toList(),
    'functions': functions.map((f) => f.toJson()).toList(),
    if (temperatureGroupAddress != null) 'temperatureGroupAddress': temperatureGroupAddress,
    if (sceneGroupAddress != null) 'sceneGroupAddress': sceneGroupAddress,
    if (icon != null) 'icon': icon,
  };

  @override
  List<Object?> get props => [id];
}

class KnxScene extends Equatable {
  const KnxScene({required this.id, required this.name, required this.number});
  final String id;
  final String name;
  final int number;

  factory KnxScene.fromJson(Map<String, dynamic> json) => KnxScene(
    id: json['id'] as String,
    name: json['name'] as String,
    number: json['number'] as int? ?? 1,
  );
  Map<String, dynamic> toJson() => {'id': id, 'name': name, 'number': number};
  @override List<Object?> get props => [id];
}

class KnxFunction extends Equatable {
  const KnxFunction({
    required this.id,
    required this.name,
    required this.type,
    required this.groupAddress,
    this.statusGroupAddress,
    this.modeOffLabel,
    this.modeOnLabel,
    this.inverted = false,
  });

  final String id;
  final String name;
  /// type: 'switch' | 'light' | 'socket' | 'lock' | 'dimmer' | 'percentage' | 'scene' | 'binary_selector'
  final String type;
  final String groupAddress;
  final String? statusGroupAddress;
  final String? modeOffLabel;
  final String? modeOnLabel;
  final bool inverted;

  factory KnxFunction.fromJson(Map<String, dynamic> json) => KnxFunction(
    id:                  json['id'] as String,
    name:                json['name'] as String,
    type:                json['type'] as String? ?? 'switch',
    groupAddress:        json['groupAddress'] as String? ?? '',
    statusGroupAddress:  json['statusGroupAddress'] as String?,
    modeOffLabel:        json['modeOffLabel'] as String?,
    modeOnLabel:         json['modeOnLabel'] as String?,
    inverted:            json['inverted'] as bool? ?? false,
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'name': name, 'type': type, 'groupAddress': groupAddress,
    if (statusGroupAddress != null) 'statusGroupAddress': statusGroupAddress,
    if (modeOffLabel != null) 'modeOffLabel': modeOffLabel,
    if (modeOnLabel != null) 'modeOnLabel': modeOnLabel,
    'inverted': inverted,
  };

  @override List<Object?> get props => [id];
}
