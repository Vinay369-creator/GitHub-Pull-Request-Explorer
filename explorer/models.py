from django.db import models

class ApiLog(models.Model):
    method = models.CharField(max_length=10)
    url = models.TextField()
    headers = models.JSONField(default=dict, blank=True)
    query_params = models.JSONField(default=dict, blank=True)
    request_body = models.JSONField(default=dict, blank=True, null=True)
    response_body = models.JSONField(default=dict, blank=True, null=True)
    status_code = models.IntegerField(default=0)
    response_time_ms = models.FloatField(default=0)
    success = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.method} {self.url} - {self.status_code}"
