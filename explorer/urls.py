from django.urls import path
from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("api/repository/", views.repository_api, name="repository_api"),
   

path("api/pulls/", views.pulls_api, name="pulls_api"),
path("api/tester/", views.api_tester, name="api_tester"),
path("api/logs/query/", views.query_logs, name="query_logs"),
path("api/logs/", views.logs_list, name="logs_list"),
]