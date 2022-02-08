#!/bin/ash

htpasswd -bc /etc/nginx/.htpasswd "$DEMO_WIREMOCK_ADMIN_USER" "$DEMO_WIREMOCK_ADMIN_PASS"
