import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
console.log('window.AwsS3:', window.AwsS3);

const RECIPIENT_STORAGE_KEY = 'recipient_emails';
const LAST_USED_RECIPIENT_KEY = 'last_used_recipient';

document.addEventListener('DOMContentLoaded', async () => {

    async function convertSvgToPng(svgBlob) {
        return new Promise(async (resolve) => {
            try {
                const svgText = await svgBlob.text();
                // A simple check to see if it's actually SVG XML
                if (!svgText.trim().startsWith('<svg')) {
                    resolve(null);
                    return;
                }
                const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();

                img.onload = () => {
                    const width = img.naturalWidth || img.width;
                    const height = img.naturalHeight || img.height;

                    if (width === 0 || height === 0) {
                        resolve(null);
                        return;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((pngBlob) => {
                        resolve(pngBlob);
                    }, 'image/png');
                };

                img.onerror = () => {
                    resolve(null);
                };

                img.src = svgDataUrl;
            } catch (error) {
                console.error('Error converting SVG to PNG:', error);
                resolve(null);
            }
        });
    }

    const subjectInput = document.getElementById('subject');
    const contentArea = document.getElementById('content');
    const sendButton = document.getElementById('sendButton');
    const recipientInput = document.getElementById('recipient');
    const recipientDropdown = document.getElementById('recipient-dropdown');
    const htmlSource = document.getElementById('html-source');
    const toggleHtmlButton = document.getElementById('toggle-html-button');

    let isHtmlMode = false;

    const HTML_EDITOR_STATE_KEY = 'html_editor_state';

    toggleHtmlButton.addEventListener('click', () => {
        isHtmlMode = !isHtmlMode;

        if (isHtmlMode) {
            // 切换到HTML视图
            const contentToSave = { isHtmlMode: true, htmlContent: contentArea.innerHTML };
            chrome.storage.local.set({ [HTML_EDITOR_STATE_KEY]: contentToSave });

            htmlSource.value = contentArea.innerHTML.replace(/<\/div><div>/g, '</div>\n<div>');
            contentArea.style.display = 'none';
            htmlSource.style.display = 'block';
            toggleHtmlButton.style.backgroundColor = '#c82333'; // 激活状态用红色突出
            toggleHtmlButton.style.color = 'white';
        } else {
            // 切换回富文本视图
            chrome.storage.local.remove([HTML_EDITOR_STATE_KEY]);

            contentArea.innerHTML = htmlSource.value;
            htmlSource.style.display = 'none';
            contentArea.style.display = 'block';
            toggleHtmlButton.style.backgroundColor = ''; // 恢复默认颜色
            toggleHtmlButton.style.color = '';
        }
    });

    htmlSource.addEventListener('input', () => {
        if (isHtmlMode) {
            chrome.storage.local.set({
                [HTML_EDITOR_STATE_KEY]: {
                    isHtmlMode: true,
                    htmlContent: htmlSource.value
                }
            });
        }
    });

    // --- Recipient Management V2 ---

    async function getRecipients() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ [RECIPIENT_STORAGE_KEY]: [] }, (result) => {
                resolve(result[RECIPIENT_STORAGE_KEY]);
            });
        });
    }

    async function saveRecipients(recipients) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [RECIPIENT_STORAGE_KEY]: recipients }, () => {
                resolve();
            });
        });
    }

    async function getLastUsedRecipient() {
        return new Promise((resolve) => {
            chrome.storage.local.get({ [LAST_USED_RECIPIENT_KEY]: null }, (result) => {
                resolve(result[LAST_USED_RECIPIENT_KEY]);
            });
        });
    }

    async function saveLastUsedRecipient(recipient) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [LAST_USED_RECIPIENT_KEY]: recipient }, () => {
                resolve();
            });
        });
    }

    function renderRecipientDropdown(recipients) {
        recipientDropdown.innerHTML = '';
        if (recipients.length === 0) {
            recipientDropdown.style.display = 'none';
            return;
        }

        recipients.forEach(recipient => {
            const item = document.createElement('div');
            item.classList.add('dropdown-item');

            const text = document.createElement('span');
            text.textContent = recipient;
            text.style.flexGrow = '1';
            item.appendChild(text);

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = 'X';
            deleteBtn.classList.add('delete-recipient-btn');
            deleteBtn.dataset.recipient = recipient;
            item.appendChild(deleteBtn);

            recipientDropdown.appendChild(item);
        });
    }

    recipientInput.addEventListener('focus', async () => {
        const recipients = await getRecipients();
        renderRecipientDropdown(recipients);
        recipientDropdown.style.display = 'block';
    });

    recipientInput.addEventListener('blur', () => {
        // Delay hiding to allow click events in the dropdown to register
        setTimeout(() => {
            recipientDropdown.style.display = 'none';
        }, 200);
    });

    recipientDropdown.addEventListener('mousedown', async (e) => {
        e.preventDefault(); // Prevent blur event from firing immediately

        if (e.target.classList.contains('delete-recipient-btn')) {
            const recipientToDelete = e.target.dataset.recipient;
            let recipients = await getRecipients();
            recipients = recipients.filter(r => r !== recipientToDelete);
            await saveRecipients(recipients);
            renderRecipientDropdown(recipients);
        } else if (e.target.closest('.dropdown-item')) {
            const selectedRecipient = e.target.closest('.dropdown-item').querySelector('span').textContent;
            recipientInput.value = selectedRecipient;
            recipientDropdown.style.display = 'none';
        }
    });

    async function initializeRecipients() {
        let recipients = await getRecipients();
        if (recipients.length === 0) {
            // Add a default recipient if the list is empty for the very first time
            recipients.push('Den<dzqinc@gmail.com>');
            await saveRecipients(recipients);
        }

        const lastUsed = await getLastUsedRecipient();
        if (lastUsed && recipients.includes(lastUsed)) {
            recipientInput.value = lastUsed;
        } else if (recipients.length > 0) {
            recipientInput.value = recipients[0];
        }
    }

    // --- End Recipient Management ---


    // 处理粘贴事件
    contentArea.addEventListener('paste', async (e) => {
        e.preventDefault();
        const clipboardData = e.clipboardData;
        let text = clipboardData.getData('text/plain');
        let html = clipboardData.getData('text/html');

        // If there's no HTML, create a basic version from the plain text to use the same logic path.
        if (!html && text) {
            html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
        }

        if (html) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            const imgPromises = [];

            if (/<img/i.test(html)) {
                const images = tempDiv.querySelectorAll('img');
                images.forEach(img => {
                    img.removeAttribute('alt');
                    // Remove all CSS classes and inline styles from the original source
                    img.removeAttribute('class');
                    img.removeAttribute('style');

                    const promise = new Promise((resolve) => {
                        const dataSrc = img.getAttribute('data-src') || img.src;
                        if (!dataSrc) {
                            resolve();
                            return;
                        }

                        img.removeAttribute('srcset');
                        img.removeAttribute('width');
                        img.removeAttribute('height');

                        const tempImg = new Image();
                        tempImg.onload = function () {
                            const isSvg = (img.getAttribute('data-src') || img.src).toLowerCase().includes('.svg');
                            if (tempImg.width > 50 && tempImg.height > 50 && !isSvg) {
                                // Large images: display as block
                                img.style.display = 'block';
                                img.style.margin = 'auto';
                                img.style.width = '500px';
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                                img.setAttribute('data-resized', 'true');
                            } else {
                                // Small images (icons/emojis): ensure inline display
                                console.log('🔍 Applying inline styles to small image:', tempImg.width, 'x', tempImg.height);
                                img.style.display = 'inline-block';
                                img.style.verticalAlign = 'text-bottom';
                                img.style.maxHeight = '1.2em';
                                img.style.maxWidth = '1.2em';
                                img.style.height = 'auto';
                                img.style.width = 'auto';
                            }
                            resolve();
                        };
                        tempImg.onerror = function () {
                            resolve();
                        };
                        img.src = dataSrc;
                        tempImg.src = dataSrc;
                    });
                    imgPromises.push(promise);
                });
            }

            await Promise.all(imgPromises);

            async function fetchImageAsBlob(url) {
                if (url.startsWith('data:')) {
                    const res = await fetch(url);
                    return await res.blob();
                } else {
                    const res = await fetch(url, { mode: 'cors' });
                    return await res.blob();
                }
            }

            async function sha1(blob) {
                const arrayBuffer = await blob.arrayBuffer();
                const hashBuffer = await crypto.subtle.digest('SHA-1', arrayBuffer);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }

            async function uploadToR2(blob, ext, sha1str) {
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const day = String(now.getDate()).padStart(2, '0');
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const key = `news/${year}/${month}/${year}${month}${day}${hours}${minutes}-${sha1str}.${ext}`;
                const bucket = 'fly';
                const endpoint = 'https://dc377c03f3b7f55990b573be1ffb8c16.r2.cloudflarestorage.com';
                const region = 'auto';
                const accessKeyId = 'c3659a57892e473e1b31a0fe060d8a46';
                const secretAccessKey = 'f45a15fe37fdae818ec9d9c35a7230675493266376ed3e88d9b5d504c76c1a99';

                const s3 = new S3Client({
                    region,
                    endpoint,
                    credentials: {
                        accessKeyId,
                        secretAccessKey
                    },
                    forcePathStyle: true
                });
                const putParams = {
                    Bucket: bucket,
                    Key: key,
                    Body: Buffer.from(await blob.arrayBuffer()),
                    ContentType: blob.type
                };
                await s3.send(new PutObjectCommand(putParams));
                return `https://pic.770214.xyz/${key}`;
            }
            if (/<img/i.test(html)) {
                const imgNodes = tempDiv.querySelectorAll('img');
                const uploadProgress = document.getElementById('upload-progress');
                let uploadedCount = 0;
                const totalImages = imgNodes.length;

                if (totalImages > 0) {
                    uploadProgress.textContent = `正在上传图片：${uploadedCount}/${totalImages}...`;
                }

                for (const img of imgNodes) {
                    let src = img.getAttribute('data-src') || img.src;
                    if (!src) continue;
                    try {
                        let blob = await fetchImageAsBlob(src);
                        let ext = 'jpg';

                        if (blob.type === 'image/svg+xml') {
                            const pngBlob = await convertSvgToPng(blob);
                            if (pngBlob) {
                                blob = pngBlob;
                                ext = 'png';
                            } else {
                                ext = 'svg'; // Fallback to svg if conversion fails
                            }
                        } else if (blob.type === 'image/png') {
                            ext = 'png';
                        } else if (blob.type === 'image/gif') {
                            ext = 'gif';
                        } else if (blob.type === 'image/webp') {
                            ext = 'webp';
                        }

                        const sha1str = await sha1(blob);
                        const r2url = await uploadToR2(blob, ext, sha1str);
                        img.src = r2url;
                        if (img.hasAttribute('data-src')) {
                            img.setAttribute('data-src', r2url);
                        }
                        uploadedCount++;
                        uploadProgress.textContent = `正在上传图片：${uploadedCount}/${totalImages}...`;
                    } catch (err) {
                        console.error('图片上传失败', err);
                    }
                }

                if (totalImages > 0) {
                    uploadProgress.textContent = '图片上传完成!';
                    setTimeout(() => {
                        uploadProgress.textContent = '';
                    }, 2000);
                }
            }

            const newContent = document.createDocumentFragment();
            let currentParagraph = null;
            let shouldStartNewLine = true;

            function simplifiedProcessNode(node, parentForChildren) {
                const tagName = node.tagName ? node.tagName.toUpperCase() : '';

                if (node.nodeType === Node.TEXT_NODE) {
                    if (!node.textContent.trim()) return;
                    const lines = node.textContent.split('\n');
                    lines.forEach((line, i) => {
                        if (i > 0) {
                            if (shouldStartNewLine && !['B', 'H4'].includes(parentForChildren.nodeName)) {
                                const spacer = document.createElement('div');
                                spacer.appendChild(document.createElement('br'));
                                parentForChildren.appendChild(spacer);
                            }
                            shouldStartNewLine = true;
                            currentParagraph = null;
                        }
                        if (!line.trim() && !['B', 'H4'].includes(parentForChildren.nodeName)) return;

                        if (shouldStartNewLine && !['B', 'H4'].includes(parentForChildren.nodeName)) {
                            currentParagraph = document.createElement('div');
                            // Only add indentation if the line doesn't already have it
                            if (!line.startsWith('　　')) {
                                currentParagraph.appendChild(document.createTextNode('　　'));
                            }
                            parentForChildren.appendChild(currentParagraph);
                            shouldStartNewLine = false;
                        }

                        const targetParent = ['B', 'H4'].includes(parentForChildren.nodeName) ? parentForChildren : currentParagraph;
                        if (targetParent) {
                            targetParent.appendChild(document.createTextNode(line));
                        }
                    });
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const isBold = ['B', 'STRONG'].includes(tagName) ||
                        (tagName === 'SPAN' && (node.style.fontWeight === 'bold' || parseInt(node.style.fontWeight) >= 700));

                    if (isBold) {
                        if (shouldStartNewLine && !['B', 'H4'].includes(parentForChildren.nodeName)) {
                            currentParagraph = document.createElement('div');
                            currentParagraph.appendChild(document.createTextNode('　　'));
                            parentForChildren.appendChild(currentParagraph);
                            shouldStartNewLine = false;
                        }
                        const boldEl = document.createElement('b');

                        const target = ['B', 'H4'].includes(parentForChildren.nodeName) ? parentForChildren : currentParagraph;

                        if (target) {
                            target.appendChild(boldEl);
                            Array.from(node.childNodes).forEach(child => simplifiedProcessNode(child, boldEl));
                        }
                    } else if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
                        shouldStartNewLine = true;
                        currentParagraph = null;

                        const h4 = document.createElement('h4');
                        h4.appendChild(document.createTextNode('　　'));
                        Array.from(node.childNodes).forEach(child => simplifiedProcessNode(child, h4));
                        parentForChildren.appendChild(h4);

                        shouldStartNewLine = true;
                        currentParagraph = null;
                    } else if (['P', 'DIV', 'BR'].includes(tagName)) {
                        // Process children of P/DIV without resetting context first
                        // This allows inline images to be added to the same paragraph as text
                        console.log('🔍 Processing', tagName, 'with', node.childNodes.length, 'children, shouldStartNewLine:', shouldStartNewLine, 'currentParagraph:', currentParagraph ? 'exists' : 'null');
                        Array.from(node.childNodes).forEach(child => simplifiedProcessNode(child, parentForChildren));
                        // After processing children, mark that we should start a new line for the next content
                        if (tagName === 'BR') {
                            if (shouldStartNewLine && !['B', 'H4'].includes(parentForChildren.nodeName)) {
                                const spacer = document.createElement('div');
                                spacer.appendChild(document.createElement('br'));
                                parentForChildren.appendChild(spacer);
                            }
                            shouldStartNewLine = true;
                            currentParagraph = null;
                        } else if (node.textContent.trim()) {
                            shouldStartNewLine = true;
                            currentParagraph = null;
                        }
                    } else if (tagName === 'IMG') {
                        const isResized = node.getAttribute('data-resized') === 'true';
                        console.log('🔍 Processing IMG, isResized:', isResized, 'shouldStartNewLine:', shouldStartNewLine, 'currentParagraph:', currentParagraph ? 'exists' : 'null', 'parentForChildren:', parentForChildren.nodeName);

                        if (isResized) {
                            // Large images: display as block
                            console.log('🔍 Large image - adding as block');
                            const clonedNode = node.cloneNode(true);
                            clonedNode.removeAttribute('data-resized');
                            parentForChildren.appendChild(clonedNode);
                            shouldStartNewLine = true;
                            currentParagraph = null;
                        } else {
                            // Small images (icons/emojis): treat as inline elements
                            console.log('🔍 Small image - treating as inline');
                            // If we're in a special parent (B or H4), append directly
                            if (['B', 'H4'].includes(parentForChildren.nodeName)) {
                                console.log('🔍 Appending to special parent:', parentForChildren.nodeName);
                                parentForChildren.appendChild(node.cloneNode(true));
                            } else {
                                // If we don't have a current paragraph, create one
                                if (!currentParagraph) {
                                    console.log('🔍 Creating new paragraph, shouldStartNewLine:', shouldStartNewLine);
                                    currentParagraph = document.createElement('div');
                                    // Only add indentation if this is truly the start of a new line
                                    if (shouldStartNewLine) {
                                        currentParagraph.appendChild(document.createTextNode('　　'));
                                    }
                                    parentForChildren.appendChild(currentParagraph);
                                } else {
                                    console.log('🔍 Using existing paragraph');
                                }
                                // Append the small image inline
                                currentParagraph.appendChild(node.cloneNode(true));
                            }
                            // Keep the line open for following text
                            shouldStartNewLine = false;
                        }
                    } else {
                        Array.from(node.childNodes).forEach(child => simplifiedProcessNode(child, parentForChildren));
                    }
                }
            }

            Array.from(tempDiv.childNodes).forEach(node => simplifiedProcessNode(node, newContent));

            const finalHtml = document.createElement('div');
            finalHtml.appendChild(newContent);
            contentArea.focus();
            document.execCommand('insertHTML', false, finalHtml.innerHTML);
        }
    });

    async function loadContent() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const currentTab = tabs[0];
            subjectInput.value = currentTab.title || '无标题';

            try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText) {
                    contentArea.innerHTML = clipboardText;
                    return;
                }
            } catch (clipError) {
                console.log('剪贴板读取失败，尝试读取存储的内容');
            }

            chrome.storage.local.get(['selectedContent'], (result) => {
                if (result.selectedContent) {
                    let content = '';
                    if (result.selectedContent.text) {
                        content += result.selectedContent.text;
                    }
                    if (result.selectedContent.image) {
                        content += `<img src="${result.selectedContent.image}" />`;
                    }
                    contentArea.innerHTML = content;
                }
            });

            chrome.storage.local.remove(['selectedContent']);

        } catch (error) {
            console.error('初始化错误:', error);
            contentArea.innerHTML = '';
        }
    }

    async function loadEditorState() {
        return new Promise(resolve => {
            chrome.storage.local.get([HTML_EDITOR_STATE_KEY], (result) => {
                const savedState = result[HTML_EDITOR_STATE_KEY];
                if (savedState && savedState.isHtmlMode) {
                    isHtmlMode = true;
                    contentArea.innerHTML = savedState.htmlContent;
                    htmlSource.value = savedState.htmlContent;

                    contentArea.style.display = 'none';
                    htmlSource.style.display = 'block';
                    toggleHtmlButton.style.backgroundColor = '#c82333';
                    toggleHtmlButton.style.color = 'white';
                }
                resolve();
            });
        });
    }

    await loadContent();
    await initializeRecipients();
    await loadEditorState();

    sendButton.textContent = '发送';

    document.addEventListener('click', (event) => {
        if (sendButton.textContent === '已成功发送' && event.target !== sendButton) {
            window.close();
        }
    });

    sendButton.addEventListener('click', async () => {
        if (sendButton.textContent === '已成功发送') {
            window.close();
            return;
        }

        let subject = subjectInput.value;
        if (!subject || subject.trim() === '') {
            subject = '无主题';
        }
        let content = isHtmlMode ? htmlSource.value : contentArea.innerHTML;
        const recipient = recipientInput.value.trim();

        if (!recipient) {
            alert('请输入收件人地址！');
            return;
        }

        const emailRegex = /^(?:.*<)?([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})(?:>)?$/;
        if (!emailRegex.test(recipient)) {
            alert('无效的收件人地址格式！');
            return;
        }

        content = content.replace(/<a /g, '<a target="_blank" ');
        content = content.replace(/ draggable="false"/g, '');

        if (!content) {
            alert('请输入要发送的内容！');
            return;
        }

        sendButton.disabled = true;
        sendButton.textContent = '发送中...';

        // Save recipient logic
        let recipients = await getRecipients();
        if (!recipients.includes(recipient)) {
            recipients.push(recipient);
            await saveRecipients(recipients);
        }
        await saveLastUsedRecipient(recipient);

        let responseReceived = false;
        const timeoutId = setTimeout(() => {
            if (!responseReceived) {
                console.log("邮件发送超时");
                alert('邮件发送超时，请检查网络连接或稍后重试');
                sendButton.disabled = false;
                sendButton.textContent = '发送';
            }
        }, 15000);

        try {
            const { Email } = await import('./smtp.js');
            await Email.send({
                to: recipient,
                subject: subject,
                body: content
            });

            responseReceived = true;
            clearTimeout(timeoutId);
            sendButton.textContent = '已成功发送';
            sendButton.disabled = false;
            // Clear editor state after successful send
            chrome.storage.local.remove([HTML_EDITOR_STATE_KEY]);
        } catch (error) {
            responseReceived = true;
            clearTimeout(timeoutId);
            console.error("发送消息错误:", error);
            alert('发送消息错误：' + error.toString());
            sendButton.disabled = false;
            sendButton.textContent = '发送';
        }
    });
});
