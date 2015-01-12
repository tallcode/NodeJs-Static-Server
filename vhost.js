/*
* 请求对应表
* forward可以是数组也可以是字符串
* http开头表示重定向
*/
var vhost = [
	//favicon.ico直接返回404
	{
		host:/.*/,
		pathname:/favicon\.ico/,
		forward:404
	},
	{
		host:/.*/,
		pathname:/^\/301\/(.*)$/,
		forward:301
	},
	{
		host:/xutao.*/,
		pathname:/^\/(.*)$/,
		forward:'/Users/ThinkBest/Workspace/website/$1'
	},
	{
		host:/.*/,
		pathname:/^\/(.*)$/,
		forward:'/Users/ThinkBest/Workspace/website/$1'
	}
];

var addFile = function (list,file){
	if(file){
		//放入列表前去除css和js文件的压缩
		if(/-min\.(css|js)/.test(file)){
			addFile(list,file.replace(/-min.(css|js)/,'.$1'));
		}
		if(/^http(s?):\/\//.test(file)){
			list.push({type:'redirect',file:file});
		}
		else if(/\.css$/.test(file)){
			list.push({type:'disk',file:file.replace('.css','.less')});
			list.push({type:'disk',file:file});
		}
		else{
			list.push({type:'disk',file:file});
		}
	}
};

//获取目标文件列表，返回是数组
exports.getTarget = function(obj){
	var
	host = obj.host,
	pathname = obj.pathname,
	referer = obj.referer,
	forward,fileList = [],
	len = vhost.length;

	for (var i = 0; i < len; i++) {
		if(vhost[i].host.test(host)&&vhost[i].pathname.test(pathname)&&(!vhost[i].referer||(!referer)||vhost[i].referer.test(referer))){
			forward = vhost[i].forward;
			switch (Object.prototype.toString.call(forward)){
				case '[object Array]':
					for(var j=0 ;j<forward.length;j++){
						addFile(fileList,pathname.replace(vhost[i].pathname,forward[j]));
					}
					break;
				case '[object String]':
					if(forward==='style-combine'){
						fileList.push({type:'combine'});
					}
					else{
						addFile(fileList,pathname.replace(vhost[i].pathname,forward));
					}
					break;
				case '[object Number]':
					//新增，直接返回状态
					fileList.push({type:'code',code:forward});
					break;
			}
			return fileList;
		}
	}
	return fileList;
};
