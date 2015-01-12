var 
cluster = require('cluster'),
http = require('http'),
//util = require('util'),
fs = require('fs'),
path = require('path'),
url = require('url'),
zlib = require("zlib"),
os = require('os'),
less = require('less'),
numCPUs = os.cpus().length,
//服务器标志字符串
serverString = 	'NodeJS(https://github.com/ThinkBest/NodeJs-Static-Server)' + ','+ 
						os.type() + '('+os.platform() + ')/' + os.release()+','+os.hostname(),

mime = require('./mime.js').mime,
getTarget = require('./vhost.js').getTarget,
listFiles = require('./dirlist.js').list,

zeroPad = function(num){
	return ('0'+num).slice(-2); 
},
format = function(date, format){
	var r = format || 'yyyy-MM-dd';
	return r.split('yyyy').join(date.getFullYear())
			.split('yy').join((date.getFullYear() + '').substring(2))            
			.split('MM').join(zeroPad(date.getMonth() + 1))
			.split('dd').join(zeroPad(date.getDate()))
			.split('hh').join(zeroPad(date.getHours()))
			.split('mm').join(zeroPad(date.getMinutes()))
			.split('ss').join(zeroPad(date.getSeconds()));
},

getClientIp = function(req) {
    var ipAddress;
    var forwardedIpsStr = req.headers['X-Forwarded-For']; 
    if (forwardedIpsStr) {
        var forwardedIps = forwardedIpsStr.split(',');
        ipAddress = forwardedIps[0];
    }
    if (!ipAddress) {
        ipAddress = req.connection.remoteAddress;
    }
    return ipAddress;
},

//写日志文件
log = function(text){
	var date = new Date();
	fs.open('logs/log-'+format(date,'yyyy-MM-dd')+'.txt','a',function(err, fd){
		if(!err){
			fs.write(fd,format(date,'hh:mm:ss')+ ' ' + text + '\r\n',0,0,function(){});
			fs.close(fd);
		}
	});    
};

//集群
if (cluster.isMaster) {
	for (var i = 0; i < numCPUs; i++) {
		cluster.fork();
	}
	cluster.on('death', function(worker) {
		log('worker ' + worker.pid + ' died.');
		cluster.fork();
	});
	console.log('listening 80 with ' + numCPUs + ' workers.');
} 
else{
	//监听端口
	http.createServer(function(req,res){
		//返回服务器标志
		res.setHeader('Server', serverString);
		parse({
			req:req,
			res:res
		});
	}).listen(80);
}

var 
//收到请求后
parse = function(obj) {
	var
	req = obj.req,
	urlObj = url.parse(decodeURIComponent(req.url||''));
	//获取主机名
	obj.host = req.headers['host']||'';
	//获取路径名
	obj.pathname = urlObj.pathname;
	//获取参数
	obj.query = urlObj.query||'';
	//tengine hack
	if(obj.query.indexOf('?')==0){
		var tengineParam = obj.query.split('?');
		obj.pathname = '??'+tengineParam[1];
		obj.query = tengineParam.length>2?tengineParam[2]:'';
	}
	//
	obj.referer = req.headers['referer']||'';
	/*
	* 获取目标文件列表,函数位于vhost.js文件中，可以自己定义内部逻辑
	* 传入对象{req,res,host,pathname,query}
	* 返回数组,例如[{type:'disk','D:\1.js'},{type:'rewrite','http://xxx/1.js'}],当数组中第一个文件访问失败，会使用下一个文件
	*/
	obj.fileList = getTarget(obj);
	//目标文件列表不为空，开始响应请求
	if(obj.fileList.length>0){
		response(obj);
	}
	else{
		//没有目标文件时显示提示文字
		obj.res.writeHead(200, {'Content-Type': 'text/plain'});
		obj.res.end('Node.JS is running \n');
	}    
},

//响应请求
response = function(obj){
	//取出目标文件列表中的第一个，判断是发送文件还是重定向
	var target = obj.fileList.shift();
	if(target&&target.type){
		if(target.file){
			obj.file = target.file;
		}
		switch(target.type){
			//重定向
			case 'redirect':
				redirect(obj);
				break;
			//磁盘文件
			case 'disk':
				sendFile(obj);
				break;
			//列出目录
			case 'list':
				directory(obj);
				break;
			//合并style
			case 'combine':
				filesCombine(obj);
				break;
			//直接返回状态
			case 'code':
				obj.res.statusCode = target.code;
				if(target.code===301){
					obj.res.setHeader('Location', decodeURIComponent(obj.pathname).replace(/^\/301\//,'')+'?'+obj.query);
				}
				obj.res.end();
		}	
	}
},

//重定向
redirect = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	file = obj.file,
	urlObj = url.parse(file||'');
	
	req.headers['X-Forwarded-For'] = getClientIp(req);
	var remoteReq = http.request({
		host: urlObj.hostname,
		port: urlObj.port||80,
		path: urlObj.path||obj.pathname,
		method: req.method||'GET',
		agent:false,
		headers: req.headers
	}, function(remoteRes){
		if(remoteRes.statusCode === 200){
			//写日志
			log(getClientIp(req)+' '+obj.host+req.url+' -> '+file+'(200)');
			//目标文件写入响应头
			res.setHeader('X-Forward', file+'(200)');
			//复制响应头
			res.writeHead(remoteRes.statusCode,remoteRes.headers);
			//复制数据
			remoteRes.on('data',function(chunk){
				res.write(chunk);
			});
			remoteRes.on('end',function(){
				res.end();
			});
		}
		else if(remoteRes.statusCode === 304){
			log(getClientIp(req)+' '+obj.host+req.url+' -> '+file+'(304)');
			//目标文件写入响应头
			res.setHeader('X-Forward', file+'(304)');
			//复制响应头
			res.writeHead(remoteRes.statusCode,remoteRes.headers);
			res.end();
		}
		//如果访问远程文件失败，且目标文件列表不为空，则使用下一个目标文件响应
		else if(obj.fileList.length>0){
			response(obj);
		}
		else{
			res.statusCode = 503;
			res.end();
		}
	});
	remoteReq.on('error',function(){
		//如果访问远程文件失败，且目标文件列表不为空，则使用下一个目标文件响应
		if(obj.fileList.length>0){
			response(obj);
		}
		else{
			res.statusCode = 503;
			res.end();
		}
	});
	//设置3秒后触发超时
	setTimeout(function() {
		remoteReq.emit('req-timeout');
	},3000);
	remoteReq.on('req-timeout',function(){
		if (remoteReq) { 
			remoteReq.abort(); 
		}
	});
	remoteReq.end();
},
//列出目录
directory = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	html = '',
	file = decodeURIComponent(path.normalize(obj.file));
	obj.file = file;
	fs.readdir(file,function(err,files){
		if(!err){
			/*
			* listFiles函数位于dirlist.js文件中
			* 可以自己定义内部的逻辑
			* 只要能返回html就可以
			*/
			html = listFiles(obj,files);
			sendHTML(obj,html);
		}
		else{
			//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
			if(obj.fileList.length>0){
				response(obj);
			}
			else{
				res.statusCode = 503;
				res.end();
			}
		}
	});
},
//文件合并
filesCombine = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	html = [],
	counter = 0,
	file = obj.pathname,
	ext = path.extname(file),
	files = [],
	failFile = [];
	if(file.indexOf('??')==0){
		files = file.split('??')[1].split(',');	
		for(var i=0;i<files.length;i++){
			files[i] = '/'+files[i];
		}
	}
	if(file.indexOf('|')>0){
		file = file.slice(0,0-ext.length);
		files = file.split('|');
		for(var i=0;i<files.length;i++){
			files[i]+=ext;
		}
	}

	var
	finish = function(){
		if(counter==files.length){
			html = Buffer.concat(html);
			//写日志
			log(getClientIp(req)+' '+obj.host+req.url+' -> filesCombine');
			var
			type = ext ? ext.slice(1) : 'unknown';
			var 
			mimeType = mime[type] || 'application/octet-stream';
			res.setHeader('X-Forward',JSON.stringify(files));
			res.setHeader('X-FAIL',JSON.stringify(failFile));
			obj.res.writeHead(200, {
				'Content-Length': html.length,
				'Content-Type': mimeType
			});
			obj.res.write(html);
			obj.res.end();
		}
	};
	for(var i=0;i<files.length;i++){
		html.push(new Buffer([]));
		(function(index){
			var param = {hostname:obj.host, path:files[index],headers:{referer:obj.referer}};
			http.get(param, function(res) {
				var response = [];
				if(res.statusCode==200){
					res.on('data', function (chunk) {
						response.push(chunk);
					});
					res.on('end',function(){
						response.push(new Buffer([0x0D,0x0A]));
						html[index] = Buffer.concat(response);
						counter++;
						finish();
					});
				}
				else{
					counter++;
					failFile.push(files[index]);
					finish();
				}
				
			}).on('error', function(e) {
				counter++;
				failFile.push(files[index]);
				finish();
			});
		})(i);
	};	
},
//发送html
sendHTML = function(obj,html){
	var
	res = obj.res;
	//写日志
	log(getClientIp(req)+' '+obj.host+req.url+' -> html');
	//目标文件写入响应头
	res.setHeader('X-Forward', 'html');
	res.writeHead(200, {
		'Content-Length': html.length,
		'Content-Type': 'text/html' 
	});
	res.write(html);
	res.end();
},
//发送文件
sendFile = function(obj){
	var 
	res = obj.res,
	req = obj.req,
	//规范文件路径
	file = decodeURIComponent(path.normalize(obj.file));
	//检查目标文件状态
	fs.stat(file, function (err,stats) {
		if(!err){
			if(stats.isFile()){
				//写日志
				log(getClientIp(req)+' '+obj.host+req.url+' -> '+file);
				//目标文件写入响应头
				res.setHeader('X-Forward', file);
				//目标是文件
				var 
				//获取文件最后修改时间
				lastModified = stats.mtime.toUTCString(),
				//获取后缀名
				ext = path.extname(file),
				ext = ext ? ext.slice(1) : 'unknown';
				//获取mime类型
				var 
				mimeType = mime[ext] || 'application/octet-stream',
				//通用响应头
				headers = {
					'Content-Type': mimeType,
					'Last-Modified':lastModified,
					'Access-Control-Allow-Origin':'*'
				};
				//文件未修改，返回304
				if (req.headers['if-modified-since'] && lastModified === req.headers['if-modified-since']) { 
					res.statusCode = 304;
					res.end(); 
				}
				else{
					if(ext==='less'){
						fs.readFile(file,function (err, data) {
							if (err) {
								res.statusCode =500;
								res.end();
							}
							else{
								try{
									less.render(data.toString(), function (e, css) {
										if (e) {
											headers['Less-Compiler-Error'] = e.toString();
											res.writeHead(500,headers);
											res.end();
										}
										else{
											res.writeHead(200,headers);
											res.write(css);
											res.end();
										}
									});
								}
								catch(e){
									headers['Less-Compiler-Error'] = e.toString();
									res.writeHead(500,headers);
									res.end();
								}
							}
						})
					}
					else{
						//文件流
						var raw = fs.createReadStream(file);
						//对css/js/html文件做压缩
						if(/css|js|html|htm/ig.test(ext)){
							if(/gzip/.test(req.headers['accept-encoding'] || '')){
								headers['Content-Encoding'] = 'gzip';
								res.writeHead(200,headers); 
								raw.pipe(zlib.createGzip()).pipe(res); 
							}
							else if(/deflate/.test(req.headers['accept-encoding'] || '')){
								headers['Content-Encoding'] = 'deflate';
								res.writeHead(200,headers); 
								raw.pipe(zlib.createDeflate()).pipe(res); 
							}
							else{
								//浏览器不支持压缩
								res.writeHead(200,headers);
								raw.pipe(res);
							}
						}
						else{
							//不是css、js、html则不压缩
							res.writeHead(200,headers);
							raw.pipe(res);
						}
					}
				}
			}
			else
			{
				//如果是目录，目标文件列表头部插入index文件
				if(stats.isDirectory()){
					//注意优先级是倒过来的，优先级index.html>index.htm>列出目录					
					obj.fileList.unshift({type:'list',file:file});
					obj.fileList.unshift({type:'disk',file:file+'/index.htm'});
					obj.fileList.unshift({type:'disk',file:file+'/index.html'});
				}

				//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
				if(obj.fileList.length>0){
					response(obj);
				}
				else{
					res.statusCode =404;
					res.end();
				}
			}
		}
		else{
			//如果目标文件访问出错，且目标文件列表不为空，则使用下一个目标文件响应
			if(obj.fileList.length>0){
				response(obj);
			}
			else{
				res.statusCode =404;
				res.end();
			}
		}
	});
};
