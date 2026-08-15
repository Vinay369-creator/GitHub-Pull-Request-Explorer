from django.contrib import admin
from .models import ApiLog

admin.site.register(ApiLog)

# @admin.register(ApiLog)
class ApiLogAdmin(admin.ModelAdmin):
    list_display = ("method", "url", "status_code", "success", "response_time_ms", "created_at")
    list_filter = ("method", "success", "status_code")
    search_fields = ("url", "error_message")
