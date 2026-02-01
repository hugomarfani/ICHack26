import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class SemanticSearchService {
  // Use 10.0.2.2 for Android emulator (maps to host localhost),
  // localhost for iOS simulator / desktop
  static String get _baseUrl {
    if (!kIsWeb && Platform.isAndroid) {
      return 'http://10.0.2.2:8000';
    }
    return 'http://localhost:8000';
  }

  /// Check if the semantic search API is available.
  Future<bool> isAvailable() async {
    try {
      final response = await http
          .get(Uri.parse('$_baseUrl/docs'))
          .timeout(const Duration(seconds: 3));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  /// Search for relevant clinical attributes based on a free-text prompt.
  /// Returns a list of attribute path IDs (e.g. "Category.attributeName").
  Future<List<String>> searchAttributes(String prompt) async {
    return searchAttributesWithContext(prompt);
  }

  /// Search with additional protocol context for better relevance.
  Future<List<String>> searchAttributesWithContext(
    String prompt, {
    String? protocolName,
    int limit = 20,
  }) async {
    try {
      // Build the query text, optionally including protocol context
      final queryText = protocolName != null
          ? '$prompt. Protocol: $protocolName'
          : prompt;

      debugPrint('[SemanticSearch] POST /suggest text="${queryText.substring(0, queryText.length > 80 ? 80 : queryText.length)}..." max_results=$limit');

      final response = await http
          .post(
            Uri.parse('$_baseUrl/suggest'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'text': queryText,
              'max_results': limit,
              'min_results': 3,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final suggestions = data['suggestions'] as List<dynamic>? ?? [];
        debugPrint('[SemanticSearch] Got ${suggestions.length} suggestions');
        return suggestions
            .map((s) => s['id'] as String)
            .toList();
      }
      return [];
    } catch (e) {
      debugPrint('[SemanticSearch] /suggest error: $e');
      return [];
    }
  }

  /// Infer the most likely JRCalc pathway from a free-text patient description.
  /// Returns the protocol name string, or null if no pathway is appropriate.
  Future<String?> inferProtocolFromPrompt(String prompt) async {
    try {
      debugPrint('[SemanticSearch] POST /pathways/suggest text="${prompt.substring(0, prompt.length > 80 ? 80 : prompt.length)}..."');

      final response = await http
          .post(
            Uri.parse('$_baseUrl/pathways/suggest'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'text': prompt,
              'min_score': 0.35,
            }),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final suggestion = data['suggestion'] as Map<String, dynamic>?;
        if (suggestion != null) {
          final title = suggestion['title'] as String?;
          debugPrint('[SemanticSearch] Inferred pathway: $title');
          return title;
        }
      }
      return null;
    } catch (e) {
      debugPrint('[SemanticSearch] /pathways/suggest error: $e');
      return null;
    }
  }
}
