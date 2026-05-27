// test/shared/models/apartment_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:knx_control/shared/models/apartment.dart';

void main() {
  group('Apartment Model', () {
    test('fromJson parses correctly', () {
      final json = {
        'id': 'apt1',
        'name': 'Test Apartment',
        'slug': 'test-apt',
        'floors': [
          {
            'id': 'floor1',
            'name': 'Ground Floor',
            'level': 0,
            'rooms': [
              {
                'id': 'room1',
                'name': 'Living Room',
                'functions': [
                  {
                    'id': 'func1',
                    'name': 'Main Light',
                    'type': 'light',
                    'groupAddress': '1/1/1',
                  }
                ],
                'scenes': [],
              }
            ]
          }
        ]
      };

      final apartment = Apartment.fromJson(json);
      expect(apartment.id, 'apt1');
      expect(apartment.name, 'Test Apartment');
      expect(apartment.slug, 'test-apt');
      expect(apartment.floors.length, 1);
      expect(apartment.floors.first.name, 'Ground Floor');
      expect(apartment.floors.first.rooms.length, 1);
      expect(apartment.floors.first.rooms.first.functions.length, 1);
      expect(apartment.floors.first.rooms.first.functions.first.type, 'light');
    });
  });
}
