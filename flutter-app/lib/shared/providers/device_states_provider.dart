import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'package:hive_flutter/hive_flutter.dart';
import '../../core/api/api_client.dart';

part 'device_states_provider.g.dart';

@Riverpod(keepAlive: true)
class KnxConnected extends _$KnxConnected {
  @override
  bool build() => false;

  void setStatus(bool status) {
    state = status;
  }
}

@Riverpod(keepAlive: true)
class DeviceStates extends _$DeviceStates {
  IO.Socket? _socket;
  final String _boxName = 'knx_cache';
  final String _cacheKey = 'device_states';

  @override
  Map<String, dynamic> build() {
    _initBox();
    _connectSocket();
    
    ref.onDispose(() {
      _socket?.dispose();
    });

    return {};
  }

  Future<void> _initBox() async {
    if (!Hive.isBoxOpen(_boxName)) {
      await Hive.openBox(_boxName);
    }
    final box = Hive.box(_boxName);
    final cached = box.get(_cacheKey);
    if (cached != null && cached is Map) {
      state = Map<String, dynamic>.from(cached);
    }
  }

  void _saveToCache(Map<String, dynamic> data) {
    if (Hive.isBoxOpen(_boxName)) {
      final box = Hive.box(_boxName);
      box.put(_cacheKey, data);
    }
  }

  void _connectSocket() {
    _socket = IO.io(wsBaseUrl, IO.OptionBuilder()
      .setTransports(['websocket'])
      .disableAutoConnect()
      .build());

    _socket?.onConnect((_) {
      print('Socket connected');
    });

    _socket?.onDisconnect((_) {
      print('Socket disconnected');
      ref.read(knxConnectedProvider.notifier).setStatus(false);
    });

    _socket?.on('knx_status', (data) {
      if (data is Map && data['connected'] != null) {
        ref.read(knxConnectedProvider.notifier).setStatus(data['connected'] == true);
      } else if (data is bool) {
        ref.read(knxConnectedProvider.notifier).setStatus(data);
      }
    });

    _socket?.on('knx_initial_states', (data) {
      if (data is Map) {
        state = {...state, ...Map<String, dynamic>.from(data)};
        _saveToCache(state);
      }
    });

    _socket?.on('knx_state_update', (data) {
      if (data is Map && data.containsKey('address') && data.containsKey('value')) {
        final newState = Map<String, dynamic>.from(state);
        newState[data['address'] as String] = data['value'];
        state = newState;
        _saveToCache(state);
      }
    });

    _socket?.on('hue_states', (data) {
      if (data is Map) {
        state = {...state, ...Map<String, dynamic>.from(data)};
        _saveToCache(state);
      }
    });

    _socket?.on('hue_state_update', (data) {
      if (data is Map && data.containsKey('id') && data.containsKey('state')) {
        final newState = Map<String, dynamic>.from(state);
        newState[data['id'] as String] = data['state'];
        state = newState;
        _saveToCache(state);
      } else if (data is Map && data.containsKey('address') && data.containsKey('value')) {
        final newState = Map<String, dynamic>.from(state);
        newState[data['address'] as String] = data['value'];
        state = newState;
        _saveToCache(state);
      }
    });

    _socket?.connect();
  }

  Future<void> updateState(String groupAddress, String type, dynamic value) async {
    // Optimistic update
    final previousState = state[groupAddress];
    final newState = Map<String, dynamic>.from(state);
    newState[groupAddress] = value;
    state = newState;
    _saveToCache(state);

    try {
      final apiClient = ref.read(apiClientProvider);
      await apiClient.post('/api/command', data: {
        'type': type,
        'address': groupAddress,
        'value': value,
      });
    } catch (e) {
      // Revert on failure
      final revertState = Map<String, dynamic>.from(state);
      if (previousState != null) {
        revertState[groupAddress] = previousState;
      } else {
        revertState.remove(groupAddress);
      }
      state = revertState;
      _saveToCache(state);
      print('Failed to update state: $e');
    }
  }
}
