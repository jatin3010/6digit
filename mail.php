<?php
/**
 * 6Digit Media contact form handler.
 *
 * SECURITY NOTE (fixed 2026): the original version of this script trusted
 * client-submitted "admin_email" / "project_name" / "form_subject" fields as
 * the mail() recipient and as raw, unsanitized mail headers. That let anyone
 * POST (or even GET-request) this file with arbitrary values and turn the
 * server into an open spam relay, or inject extra mail headers (header
 * injection / email spoofing). This version hardcodes the recipient and
 * strips/escapes everything else before it touches a mail header or the
 * email body.
 */

// Only accept real form submissions — GET-triggered mail sending is removed entirely.
if ( $_SERVER['REQUEST_METHOD'] !== 'POST' ) {
	http_response_code(405);
	exit('Method Not Allowed');
}

// --- Recipient is fixed server-side. NEVER take this from client input. ---
const RECIPIENT_EMAIL = 'hello@6digitmedia.com';
const SITE_NAME       = '6Digit Media';

// --- Honeypot: a hidden field ("website") that real visitors never fill in. ---
if ( !empty($_POST['website']) ) {
	// Likely a bot — pretend success, do nothing.
	exit('OK');
}

// --- Very small file-based rate limit (per IP), fails open if it can't write. ---
function rate_limited($max_per_hour = 10) {
	try {
		$dir = __DIR__ . '/.rate_limit';
		if ( !is_dir($dir) ) { @mkdir($dir, 0700); }
		// Only REMOTE_ADDR: the CF-Connecting-IP / X-Forwarded-For headers can be typed by the
		// sender, so trusting them let anyone dodge this limit with a new fake value per request.
		// shortcut: behind Cloudflare or a proxy every visitor shares one address, upgrade then
		// to trust that proxy's header (and only when the request really comes from the proxy).
		$ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
		$file = $dir . '/' . hash('sha256', $ip) . '.json';
		$now  = time();
		// Opportunistic cleanup (~1 in 50 requests): drop per-IP files untouched for over
		// an hour, so the folder doesn't accumulate one file per visitor forever.
		if ( mt_rand(1, 50) === 1 ) {
			foreach ( glob($dir . '/*.json') ?: [] as $old ) {
				if ( @filemtime($old) < $now - 3600 ) { @unlink($old); }
			}
		}
		$hits = [];
		if ( is_file($file) ) {
			$hits = json_decode((string) @file_get_contents($file), true) ?: [];
		}
		$hits = array_values(array_filter($hits, fn($t) => $t > $now - 3600));
		if ( count($hits) >= $max_per_hour ) {
			return true;
		}
		$hits[] = $now;
		@file_put_contents($file, json_encode($hits));
		return false;
	} catch (\Throwable $e) {
		return false; // never block legitimate mail over a logging failure
	}
}

if ( rate_limited() ) {
	http_response_code(429);
	exit('Too many requests — please try again later.');
}

/** Strip CR/LF and other control characters so a field can never inject extra mail headers. */
function clean_header_value($value) {
	$value = (string) $value;
	$value = str_replace(["\r", "\n", "%0a", "%0d", "%0A", "%0D"], '', $value);
	return trim($value);
}

/** Escape a value before it goes into the HTML email body. */
function clean_body_value($value) {
	return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function adopt($text) {
	return '=?UTF-8?B?' . base64_encode($text) . '?=';
}

$form_subject = clean_header_value($_POST['form_subject'] ?? 'New enquiry from 6digitmedia.com');

// Reply-To: only use the submitted email if it's actually a valid address; otherwise fall back.
$submitted_email = clean_header_value($_POST['E-mail'] ?? '');
$reply_to        = filter_var($submitted_email, FILTER_VALIDATE_EMAIL) ? $submitted_email : RECIPIENT_EMAIL;

// Build the message body from everything else, HTML-escaped.
$c       = true;
$message = '';
foreach ( $_POST as $key => $value ) {
	if ( $value === '' || in_array($key, ['project_name', 'admin_email', 'form_subject', 'website'], true) ) {
		continue;
	}
	$row_class = ( $c = !$c ) ? '<tr>' : '<tr style="background-color: #f8f8f8;">';
	$message  .= "
		{$row_class}
			<td style='padding: 10px; border: #e9e9e9 1px solid;'><b>" . clean_body_value($key) . "</b></td>
			<td style='padding: 10px; border: #e9e9e9 1px solid;'>" . nl2br(clean_body_value($value)) . "</td>
		</tr>
	";
}
$message = "<table style='width: 100%;'>$message</table>";

$headers = "MIME-Version: 1.0" . PHP_EOL .
	"Content-Type: text/html; charset=utf-8" . PHP_EOL .
	'From: ' . adopt(SITE_NAME) . ' <' . RECIPIENT_EMAIL . '>' . PHP_EOL .
	'Reply-To: ' . $reply_to . PHP_EOL;

// Report the result as the HTTP status so the form's error state can fire.
// Note: true only means the local mail server accepted it, not that it was delivered.
if ( mail(RECIPIENT_EMAIL, adopt($form_subject), $message, $headers) ) {
	// A plain form post (JavaScript off or failed) gets the thank-you page; the script's own
	// request (jQuery marks it with this header) just gets "OK" and redirects itself.
	if ( ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest' ) {
		header('Location: thank-you.html', true, 303);
		exit;
	}
	exit('OK');
}
http_response_code(500);
exit('Mail send failed');
